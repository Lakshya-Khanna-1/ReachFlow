import { randomUUID } from "node:crypto";
import { resolveMx } from "node:dns/promises";
import { and, eq, sql, inArray } from "drizzle-orm";
import { database } from "../db";
import {
  campaigns,
  contacts,
  drafts,
  leads,
  templateVersions,
  sendLog,
  dailyCounters,
  workerState,
  suppression,
  replyEvents,
} from "../db/schema";
import { config, getSetting, type AppSettings } from "./settings";
import { connectedAddress, mime, sendRaw, findSent, GmailError } from "./gmail";
import { inHours, nextWindow, localParts, warmupCap, jitter } from "./schedule";
import { emailSchema } from "./contracts";

export function state(key: string, connection = database()) {
  return (
    connection.db
      .select()
      .from(workerState)
      .where(eq(workerState.key, key))
      .get()?.value ?? ""
  );
}
export function setState(key: string, value: string, connection = database()) {
  connection.db.transaction((tx) =>
    tx
      .insert(workerState)
      .values({ key, value })
      .onConflictDoUpdate({ target: workerState.key, set: { value } })
      .run(),
  );
}
export async function mxValid(email: string) {
  const valid = emailSchema.safeParse(email);
  if (!valid.success) return false;
  try {
    const records = await resolveMx(valid.data.split("@")[1]);
    return records.some((r) => !!r.exchange && r.exchange !== ".");
  } catch {
    return false;
  }
}
export function reserve(c: AppSettings, now: Date, connection = database()) {
  const db = connection.db;
  const local = localParts(now, c.timezone);
  const counterKey = (c.dryRun ? "dry:" : "") + local.date;
  const prefix = c.dryRun ? "dry:" : "";
  if (!inHours(c, now)) return null;
  return db.transaction((tx) => {
    if (
      Number(state("nextSendAt", connection)) > now.getTime() ||
      tx.select().from(sendLog).where(eq(sendLog.status, "sending")).get()
    )
      return null;
    const existing = tx
      .select()
      .from(dailyCounters)
      .where(eq(dailyCounters.localDate, counterKey))
      .get();
    const computed = warmupCap(
      c,
      local.date,
      state(prefix + "warmupStart", connection),
      state(prefix + "lastSentDate", connection),
    );
    const cap = Math.min(c.dailyCap, existing?.capApplied ?? computed, 50);
    tx.insert(dailyCounters)
      .values({ localDate: counterKey, capApplied: cap, sentCount: 0 })
      .onConflictDoNothing()
      .run();
    const used = existing?.sentCount ?? 0;
    const reserved = tx
      .select({ n: sql<number>`count(*)` })
      .from(sendLog)
      .where(
        and(
          eq(sendLog.localDate, counterKey),
          inArray(sendLog.status, ["sending", "uncertain"]),
        ),
      )
      .get()!.n;
    if (used + reserved >= cap) return null;
    const rows = tx
      .select({
        draft: drafts,
        lead: leads,
        contact: contacts,
        campaign: campaigns,
        version: templateVersions,
      })
      .from(drafts)
      .innerJoin(leads, eq(drafts.leadId, leads.id))
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(campaigns, eq(drafts.campaignId, campaigns.id))
      .innerJoin(templateVersions, eq(drafts.versionId, templateVersions.id))
      .where(
        and(
          eq(campaigns.status, "queued"),
          eq(drafts.status, "approved"),
          eq(drafts.isTest, false),
          eq(templateVersions.approved, true),
        ),
      )
      .orderBy(campaigns.createdAt, drafts.id)
      .limit(100)
      .all();
    for (const row of rows) {
      const mode = state(`campaignMode:${row.campaign.id}`, connection);
      if (!mode) continue;
      const approved = JSON.parse(mode) as {
        dryRun: boolean;
        versionId: string;
      };
      if (
        approved.dryRun !== c.dryRun ||
        approved.versionId !== row.version.id
      ) {
        tx.update(campaigns)
          .set({ status: "paused" })
          .where(eq(campaigns.id, row.campaign.id))
          .run();
        continue;
      }
      const blocked =
        row.contact.status !== "pending" ||
        !!tx
          .select()
          .from(suppression)
          .where(eq(suppression.email, row.contact.email))
          .get() ||
        !!tx
          .select()
          .from(sendLog)
          .where(
            and(
              eq(sendLog.contactId, row.contact.id),
              eq(sendLog.dryRun, false),
              inArray(sendLog.status, ["sending", "sent", "uncertain"]),
            ),
          )
          .get();
      if (blocked) {
        tx.update(drafts)
          .set({
            status: "rejected",
            flags: ["already_contacted_or_suppressed"],
          })
          .where(eq(drafts.id, row.draft.id))
          .run();
        continue;
      }
      const id = randomUUID();
      tx.update(drafts)
        .set({ status: "sending" })
        .where(and(eq(drafts.id, row.draft.id), eq(drafts.status, "approved")))
        .run();
      const log = tx
        .insert(sendLog)
        .values({
          id,
          draftId: row.draft.id,
          contactId: row.contact.id,
          startedAt: now.getTime(),
          localDate: counterKey,
          status: "sending",
          dryRun: c.dryRun,
        })
        .onConflictDoUpdate({
          target: sendLog.draftId,
          set: {
            startedAt: now.getTime(),
            localDate: counterKey,
            status: "sending",
            error: null,
            dryRun: c.dryRun,
          },
        })
        .returning()
        .get();
      if (
        !state(prefix + "warmupStart", connection) ||
        (state(prefix + "lastSentDate", connection) &&
          Date.parse(local.date) -
            Date.parse(state(prefix + "lastSentDate", connection)) >
            14 * 86400000)
      )
        tx.insert(workerState)
          .values({ key: prefix + "warmupStart", value: local.date })
          .onConflictDoUpdate({
            target: workerState.key,
            set: { value: local.date },
          })
          .run();
      return { ...row, log, cap };
    }
    return null;
  });
}
export function complete(
  reservation: NonNullable<ReturnType<typeof reserve>>,
  sent: { messageId: string; threadId: string },
  now: Date,
  connection = database(),
  delay = 0,
) {
  connection.db.transaction((tx) => {
    const current = tx
      .select()
      .from(sendLog)
      .where(eq(sendLog.id, reservation.log.id))
      .get();
    if (!current || current.status === "sent" || current.status === "dry_run")
      return;
    tx.update(sendLog)
      .set({
        status: reservation.log.dryRun ? "dry_run" : "sent",
        sentAt: now.getTime(),
        messageId: sent.messageId,
        threadId: sent.threadId,
        error: null,
      })
      .where(eq(sendLog.id, current.id))
      .run();
    tx.update(drafts)
      .set({ status: "sent" })
      .where(eq(drafts.id, reservation.draft.id))
      .run();
    if (!reservation.log.dryRun)
      tx.update(contacts)
        .set({ status: "sent", firstContactedAt: now.getTime() })
        .where(eq(contacts.id, reservation.contact.id))
        .run();
    tx.update(dailyCounters)
      .set({ sentCount: sql`${dailyCounters.sentCount}+1` })
      .where(eq(dailyCounters.localDate, current.localDate))
      .run();
    tx.insert(workerState)
      .values({ key: "nextSendAt", value: String(now.getTime() + delay) })
      .onConflictDoUpdate({
        target: workerState.key,
        set: { value: String(now.getTime() + delay) },
      })
      .run();
    tx.insert(workerState)
      .values({
        key: (current.dryRun ? "dry:" : "") + "lastSentDate",
        value: current.localDate.replace(/^dry:/, ""),
      })
      .onConflictDoUpdate({
        target: workerState.key,
        set: { value: current.localDate.replace(/^dry:/, "") },
      })
      .run();
  });
}
export async function reconcile(connection = database(), lookup = findSent) {
  const db = connection.db;
  const rows = db
    .select()
    .from(sendLog)
    .where(inArray(sendLog.status, ["sending", "uncertain"]))
    .all();
  for (const log of rows) {
    const draft = db
      .select()
      .from(drafts)
      .where(eq(drafts.id, log.draftId))
      .get()!;
    if (log.dryRun) {
      db.transaction((tx) => {
        tx.update(sendLog)
          .set({
            status: "failed",
            error: "Interrupted dry run; safe to retry",
          })
          .where(eq(sendLog.id, log.id))
          .run();
        tx.update(drafts)
          .set({ status: "approved" })
          .where(eq(drafts.id, draft.id))
          .run();
      });
      continue;
    }
    const found = await lookup(draft.idempotencyKey);
    db.transaction((tx) => {
      if (found?.id && found.threadId) {
        tx.update(sendLog)
          .set({
            status: "sent",
            sentAt: log.startedAt,
            messageId: found.id,
            threadId: found.threadId,
          })
          .where(eq(sendLog.id, log.id))
          .run();
        tx.update(drafts)
          .set({ status: "sent" })
          .where(eq(drafts.id, draft.id))
          .run();
        tx.update(contacts)
          .set({ status: "sent", firstContactedAt: log.startedAt })
          .where(eq(contacts.id, log.contactId))
          .run();
        tx.update(dailyCounters)
          .set({ sentCount: sql`${dailyCounters.sentCount}+1` })
          .where(eq(dailyCounters.localDate, log.localDate))
          .run();
      } else {
        tx.update(sendLog)
          .set({
            status: "uncertain",
            error: "Delivery cannot be confirmed. Never automatically resent.",
          })
          .where(eq(sendLog.id, log.id))
          .run();
        tx.update(drafts)
          .set({ status: "uncertain", flags: ["delivery_uncertain"] })
          .where(eq(drafts.id, draft.id))
          .run();
      }
    });
  }
  return rows.length;
}
export async function dispatchStep(
  connection = database(),
  c = config(),
  now = new Date(),
  transport = sendRaw,
  checkMx = mxValid,
  pauseReason = getSetting("pauseReason") ?? "",
) {
  const db = connection.db;
  if (state("paused", connection) === "true" || pauseReason) {
    setState("status", pauseReason || "Paused", connection);
    return false;
  }
  if (Number(state("nextSendAt", connection)) > now.getTime()) return false;
  const hasQueue = db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, "queued"))
    .get();
  if (!hasQueue) {
    setState("status", "Idle — Waiting for a new sheet", connection);
    return false;
  }
  if (!inHours(c, now)) {
    setState("status", "Waiting for business hours", connection);
    setState("nextSendAt", String(nextWindow(c, now)), connection);
    return false;
  }
  if (!c.dryRun) {
    if (!c.senderName.trim() || !c.noticeAccepted) {
      setState(
        "status",
        "Set a sender name and acknowledge Gmail risks in Settings",
        connection,
      );
      return false;
    }
    const recent = db
      .select({ id: sendLog.id })
      .from(sendLog)
      .where(and(eq(sendLog.status, "sent"), eq(sendLog.dryRun, false)))
      .orderBy(sql`${sendLog.sentAt} DESC`)
      .limit(20)
      .all();
    const bounces = recent.length
      ? db
          .select({ n: sql<number>`count(DISTINCT ${replyEvents.sendId})` })
          .from(replyEvents)
          .where(
            and(
              inArray(
                replyEvents.sendId,
                recent.map((r) => r.id),
              ),
              eq(replyEvents.type, "bounce"),
            ),
          )
          .get()!.n
      : 0;
    if (recent.length === 20 && bounces / 20 > 0.05) {
      setState("paused", "true", connection);
      setState(
        "status",
        "Auto-paused: bounce rate exceeds 5% of last 20 sends",
        connection,
      );
      return false;
    }
  }
  const reservation = reserve(c, now, connection);
  if (!reservation) {
    const queued = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, "queued"))
      .all();
    for (const campaign of queued) {
      const remaining = db
        .select()
        .from(drafts)
        .where(
          and(
            eq(drafts.campaignId, campaign.id),
            inArray(drafts.status, ["approved", "sending"]),
          ),
        )
        .get();
      if (!remaining)
        db.transaction((tx) =>
          tx
            .update(campaigns)
            .set({ status: "complete" })
            .where(eq(campaigns.id, campaign.id))
            .run(),
        );
    }
    const queuedLeft = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, "queued"))
      .get();
    if (!queuedLeft) {
      setState("status", "Idle — Waiting for a new sheet", connection);
      return false;
    }
    const key = (c.dryRun ? "dry:" : "") + localParts(now, c.timezone).date;
    const counter = db
      .select()
      .from(dailyCounters)
      .where(eq(dailyCounters.localDate, key))
      .get();
    const reservations = db
      .select({ n: sql<number>`count(*)` })
      .from(sendLog)
      .where(
        and(
          eq(sendLog.localDate, key),
          inArray(sendLog.status, ["sending", "uncertain"]),
        ),
      )
      .get()!.n;
    const full =
      !!counter &&
      counter.sentCount + reservations >=
        Math.min(c.dailyCap, counter.capApplied);
    setState(
      "status",
      full
        ? "Daily quota used; waiting for next business day"
        : "Checking remaining drafts",
      connection,
    );
    if (full) {
      let t = now.getTime() + 60000;
      const today = localParts(now, c.timezone).date;
      while (localParts(new Date(t), c.timezone).date === today) t += 60000;
      setState("nextSendAt", String(nextWindow(c, new Date(t))), connection);
    } else setState("nextSendAt", String(now.getTime() + 1000), connection);
    return false;
  }
  setState("status", `Sending to ${reservation.contact.email}`, connection);
  try {
    const hardFlags = [];
    if (
      (reservation.draft.body.match(/https?:\/\//gi) ?? []).length > 1 ||
      /bit\.ly|tinyurl\.com|t\.co\//i.test(reservation.draft.body)
    )
      hardFlags.push("link_policy");
    if (c.footer && !reservation.draft.body.includes(c.footer))
      hardFlags.push("missing_footer");
    if (hardFlags.length) {
      db.transaction((tx) => {
        tx.update(sendLog)
          .set({
            status: "failed",
            error: "Deliverability guard blocked this draft",
          })
          .where(eq(sendLog.id, reservation.log.id))
          .run();
        tx.update(drafts)
          .set({
            status: "attention",
            flags: [...reservation.draft.flags, ...hardFlags],
          })
          .where(eq(drafts.id, reservation.draft.id))
          .run();
      });
      return true;
    }
    if (!c.dryRun && !(await checkMx(reservation.contact.email))) {
      db.transaction((tx) => {
        tx.update(sendLog)
          .set({ status: "failed", error: "Recipient MX validation failed" })
          .where(eq(sendLog.id, reservation.log.id))
          .run();
        tx.update(drafts)
          .set({
            status: "attention",
            flags: [...reservation.draft.flags, "invalid_mx"],
          })
          .where(eq(drafts.id, reservation.draft.id))
          .run();
      });
      return true;
    }
    if (
      !c.dryRun &&
      (db
        .select()
        .from(contacts)
        .where(eq(contacts.id, reservation.contact.id))
        .get()?.status !== "pending" ||
        db
          .select()
          .from(suppression)
          .where(eq(suppression.email, reservation.contact.email))
          .get())
    ) {
      db.transaction((tx) => {
        tx.update(sendLog)
          .set({ status: "failed", error: "Suppressed before sending" })
          .where(eq(sendLog.id, reservation.log.id))
          .run();
        tx.update(drafts)
          .set({ status: "rejected", flags: ["suppressed"] })
          .where(eq(drafts.id, reservation.draft.id))
          .run();
      });
      return true;
    }
    const sent = c.dryRun
      ? {
          messageId: `dry-${reservation.draft.idempotencyKey}`,
          threadId: `dry-${reservation.draft.idempotencyKey}`,
        }
      : await transport(
          mime({
            to: reservation.contact.email,
            from: connectedAddress(),
            fromName: c.senderName,
            subject: reservation.draft.subject,
            body: reservation.draft.body,
            key: reservation.draft.idempotencyKey,
          }),
        );
    complete(reservation, sent, now, connection, jitter(c));
    setState("backoff", "0", connection);
    setState(
      "status",
      c.dryRun ? "Dry-run delivery recorded" : "Sent",
      connection,
    );
    return true;
  } catch (error) {
    const safe =
      error instanceof GmailError &&
      (error.status === 429 || error.status === 401 || error.status === 403);
    db.transaction((tx) => {
      tx.update(sendLog)
        .set({
          status: safe ? "failed" : "uncertain",
          error:
            error instanceof GmailError
              ? error.message
              : "Delivery interrupted; reconciliation required",
        })
        .where(eq(sendLog.id, reservation.log.id))
        .run();
      tx.update(drafts)
        .set({
          status: safe ? "approved" : "uncertain",
          flags: safe ? reservation.draft.flags : ["delivery_uncertain"],
        })
        .where(eq(drafts.id, reservation.draft.id))
        .run();
    });
    if (
      error instanceof GmailError &&
      (error.status === 401 || error.status === 403)
    )
      setState("paused", "true", connection);
    const backoff = Math.min(Number(state("backoff", connection) || 0) + 1, 8);
    setState("backoff", String(backoff), connection);
    setState(
      "nextSendAt",
      String(now.getTime() + Math.min(1800000, 60000 * 2 ** backoff)),
      connection,
    );
    setState(
      "status",
      error instanceof GmailError
        ? error.message
        : "Delivery uncertain; will reconcile without resending",
      connection,
    );
    return true;
  }
}
