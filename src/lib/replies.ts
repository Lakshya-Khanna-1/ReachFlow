import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { gmail_v1 } from "googleapis";
import { database } from "../db";
import {
  contacts,
  sendLog,
  replyEvents,
  alertsSent,
  suppression,
  leads,
  drafts,
} from "../db/schema";
import {
  gmail,
  gmailFailure,
  connectedAddress,
  mime,
  sendRaw,
  findSent,
} from "./gmail";
import { config, getSetting } from "./settings";
import { state, setState } from "./dispatcher";
export type ReplyType = "reply" | "bounce" | "auto_reply" | "unsubscribe";
export function replyText(body: string) {
  return body
    .split(/\n(?:On .+wrote:|From:|_{5,}|-{5,})/i)[0]
    .split("\n")
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n")
    .trim();
}
export function classifyReply(
  from: string,
  subject: string,
  body: string,
  headers: Record<string, string> = {},
): ReplyType {
  const text = replyText(body);
  if (
    /mailer-daemon|postmaster/i.test(from) ||
    /delivery.status|delivery failure|undeliverable|delivery notification/i.test(
      subject,
    ) ||
    /delivery-status/i.test(headers["content-type"] ?? "")
  )
    return "bounce";
  if (
    (headers["auto-submitted"] && headers["auto-submitted"] !== "no") ||
    headers["x-autoreply"] ||
    /out of office|automatic reply|auto.?reply|vacation response/i.test(subject)
  )
    return "auto_reply";
  if (
    /\b(?:remove me (?:from|off)|stop emailing me|stop contacting me|do not contact me|don't email me)\b/i.test(
      text,
    ) ||
    /(?:^|\n)\s*(?:please\s+)?(?:unsubscribe\b|remove me\b|stop (?:emailing|contacting|sending)\b|do not (?:email|contact)\b|don't (?:email|contact)\b)/i.test(
      text,
    )
  )
    return "unsubscribe";
  return "reply";
}
export function recordReply(
  log: typeof sendLog.$inferSelect,
  messageId: string,
  type: ReplyType,
  snippet: string,
  connection = database(),
) {
  return connection.db.transaction((tx) => {
    const existing = tx
      .select()
      .from(replyEvents)
      .where(eq(replyEvents.messageId, messageId))
      .get();
    if (existing) return existing;
    const event = tx
      .insert(replyEvents)
      .values({
        id: randomUUID(),
        messageId,
        sendId: log.id,
        type,
        snippet: snippet.slice(0, 500),
        createdAt: Date.now(),
      })
      .returning()
      .get();
    const contact = tx
      .select()
      .from(contacts)
      .where(eq(contacts.id, log.contactId))
      .get()!;
    if (type === "bounce" || type === "unsubscribe") {
      tx.update(contacts)
        .set({ status: type === "bounce" ? "bounced" : "suppressed" })
        .where(eq(contacts.id, contact.id))
        .run();
      tx.insert(suppression)
        .values({ email: contact.email, reason: type, createdAt: Date.now() })
        .onConflictDoNothing()
        .run();
    } else if (
      type === "reply" &&
      contact.status !== "suppressed" &&
      contact.status !== "bounced"
    )
      tx.update(contacts)
        .set({ status: "replied" })
        .where(eq(contacts.id, contact.id))
        .run();
    return event;
  });
}
export async function alertOnce(
  eventId: string,
  recipient: string,
  send: (key: string) => Promise<unknown>,
  connection = database(),
  lookup = findSent,
) {
  const existing = connection.db
    .select()
    .from(alertsSent)
    .where(
      and(eq(alertsSent.eventId, eventId), eq(alertsSent.recipient, recipient)),
    )
    .get();
  if (existing) {
    if (existing.status !== "sent") {
      const found = await lookup(existing.idempotencyKey);
      if (found?.id)
        connection.db.transaction((tx) =>
          tx
            .update(alertsSent)
            .set({ status: "sent", sentAt: Date.now() })
            .where(eq(alertsSent.idempotencyKey, existing.idempotencyKey))
            .run(),
        );
    }
    return false;
  }
  const key = randomUUID();
  const claimed = connection.db.transaction((tx) =>
    tx
      .insert(alertsSent)
      .values({ eventId, recipient, idempotencyKey: key, status: "sending" })
      .onConflictDoNothing()
      .returning()
      .get(),
  );
  if (!claimed) return false;
  try {
    await send(key);
    connection.db.transaction((tx) =>
      tx
        .update(alertsSent)
        .set({ status: "sent", sentAt: Date.now() })
        .where(eq(alertsSent.idempotencyKey, key))
        .run(),
    );
    return true;
  } catch {
    connection.db.transaction((tx) =>
      tx
        .update(alertsSent)
        .set({ status: "uncertain" })
        .where(eq(alertsSent.idempotencyKey, key))
        .run(),
    );
    setState(
      "lastError",
      "An alert delivery is uncertain. It will be checked in Gmail Sent without automatic resend.",
      connection,
    );
    return false;
  }
}
function headers(message: gmail_v1.Schema$Message) {
  return Object.fromEntries(
    (message.payload?.headers ?? []).map((h) => [
      (h.name ?? "").toLowerCase(),
      h.value ?? "",
    ]),
  );
}
function bodyOf(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  const nested = part.parts?.map(bodyOf).filter(Boolean).join("\n");
  if (nested) return nested;
  if (part.body?.data)
    return Buffer.from(part.body.data, "base64url")
      .toString("utf8")
      .replace(/<[^>]+>/g, " ");
  return "";
}
export async function notifyPending(connection = database()) {
  const db = connection.db;
  const c = config();
  const events = db
    .select({
      event: replyEvents,
      log: sendLog,
      contact: contacts,
      lead: leads.cleaned,
    })
    .from(replyEvents)
    .innerJoin(sendLog, eq(replyEvents.sendId, sendLog.id))
    .innerJoin(contacts, eq(sendLog.contactId, contacts.id))
    .innerJoin(drafts, eq(sendLog.draftId, drafts.id))
    .innerJoin(leads, eq(drafts.leadId, leads.id))
    .where(and(eq(replyEvents.type, "reply"), eq(sendLog.dryRun, false)))
    .all();
  for (const { event, log, contact, lead } of events)
    for (const to of c.forwardTo)
      await alertOnce(
        event.id,
        to,
        (key) =>
          sendRaw(
            mime({
              to,
              from: connectedAddress(),
              fromName: c.senderName,
              subject: `ReachFlow reply: ${lead.name || contact.email}`.slice(
                0,
                150,
              ),
              body: `${lead.name || contact.email}${lead.company ? ` at ${lead.company}` : ""} replied.\n\n${event.snippet}\n\nOpen Gmail: https://mail.google.com/mail/u/${encodeURIComponent(connectedAddress())}/#all/${log.threadId}`,
              key,
            }),
          ),
        connection,
      );
}
export async function pollReplies(connection = database()) {
  if (!getSetting("googleToken") || getSetting("pauseReason")) return;
  const db = connection.db;
  const logs = db
    .select()
    .from(sendLog)
    .where(and(eq(sendLog.dryRun, false), eq(sendLog.status, "sent")))
    .all();
  if (!logs.length) return;
  try {
    const api = gmail();
    for (const log of logs) {
      if (!log.threadId) continue;
      const response = await api.users.threads.get(
        { userId: "me", id: log.threadId, format: "full" },
        { retry: false, timeout: 20000 },
      );
      const contact = db
        .select()
        .from(contacts)
        .where(eq(contacts.id, log.contactId))
        .get()!;
      for (const message of response.data.messages ?? []) {
        if (
          !message.id ||
          message.id === log.messageId ||
          Number(message.internalDate ?? 0) < log.startedAt
        )
          continue;
        const h = headers(message);
        const from = h.from ?? "";
        const body = bodyOf(message.payload);
        const kind = classifyReply(from, h.subject ?? "", body, h);
        const address = from
          .match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/i)?.[0]
          ?.toLowerCase();
        if (address !== contact.email && kind !== "bounce") continue;
        recordReply(
          log,
          message.id,
          kind,
          replyText(body || message.snippet || "").slice(0, 500),
          connection,
        );
      }
    }
    const since = Math.floor(Math.min(...logs.map((l) => l.startedAt)) / 1000);
    let pageToken: string | undefined;
    do {
      const response = await api.users.messages.list(
        {
          userId: "me",
          q: `after:${since} (from:mailer-daemon OR from:postmaster OR subject:undeliverable)`,
          maxResults: 100,
          pageToken,
        },
        { retry: false, timeout: 20000 },
      );
      for (const summary of response.data.messages ?? []) {
        if (
          !summary.id ||
          db
            .select()
            .from(replyEvents)
            .where(eq(replyEvents.messageId, summary.id))
            .get()
        )
          continue;
        const message = (
          await api.users.messages.get(
            { userId: "me", id: summary.id, format: "full" },
            { retry: false, timeout: 20000 },
          )
        ).data;
        const h = headers(message);
        const body = bodyOf(message.payload);
        if (classifyReply(h.from ?? "", h.subject ?? "", body, h) !== "bounce")
          continue;
        const key = body.match(/([a-f0-9-]{36})@reachflow\.local/i)?.[1];
        const recipient = body
          .match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+)/i)?.[1]
          ?.toLowerCase();
        const matching = logs.find((log) =>
          key
            ? db
                .select()
                .from(drafts)
                .where(
                  and(
                    eq(drafts.id, log.draftId),
                    eq(drafts.idempotencyKey, key),
                  ),
                )
                .get()
            : recipient &&
              db
                .select()
                .from(contacts)
                .where(
                  and(
                    eq(contacts.id, log.contactId),
                    eq(contacts.email, recipient),
                  ),
                )
                .get(),
        );
        if (matching)
          recordReply(
            matching,
            summary.id,
            "bounce",
            replyText(body || message.snippet || "").slice(0, 500),
            connection,
          );
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
    await notifyPending(connection);
    setState("lastReplyPoll", String(Date.now()), connection);
    setState("replyError", "", connection);
  } catch (e) {
    try {
      gmailFailure(e);
    } catch (safe) {
      setState(
        "replyError",
        safe instanceof Error ? safe.message : "Reply poll failed",
        connection,
      );
    }
    throw new Error(
      "Reply polling failed. Check Google connection and worker status.",
    );
  }
}
export function replyPollDue(connection = database()) {
  return (
    Date.now() - Number(state("lastReplyAttempt", connection) || 0) > 300000
  );
}
