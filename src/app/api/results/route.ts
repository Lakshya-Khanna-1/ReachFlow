import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { database } from "@/db";
import {
  campaigns,
  leads,
  drafts,
  contacts,
  sendLog,
  replyEvents,
  suppression,
} from "@/db/schema";
import { suppress } from "@/db/repository";
import { guard, jsonInput, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const q = new URL(request.url).searchParams;
    const db = database().db;
    const mode = q.get("mode");
    if (mode === "suppression")
      return Response.json(
        db
          .select()
          .from(suppression)
          .orderBy(sql`${suppression.createdAt} DESC`)
          .limit(1000)
          .all(),
      );
    if (mode === "replies") {
      const rows = db
        .select({
          event: replyEvents,
          log: sendLog,
          contact: contacts,
          lead: leads.cleaned,
          original: { subject: drafts.subject, body: drafts.body },
        })
        .from(replyEvents)
        .innerJoin(sendLog, eq(replyEvents.sendId, sendLog.id))
        .innerJoin(contacts, eq(sendLog.contactId, contacts.id))
        .innerJoin(drafts, eq(sendLog.draftId, drafts.id))
        .innerJoin(leads, eq(drafts.leadId, leads.id))
        .orderBy(sql`${replyEvents.createdAt} DESC`)
        .limit(1000)
        .all();
      return Response.json(rows);
    }
    if (mode === "export") {
      const rows = db
        .select({
          campaign: campaigns.name,
          email: contacts.email,
          name: sql<string>`json_extract(${leads.cleaned}, '$.name')`,
          company: sql<string>`json_extract(${leads.cleaned}, '$.company')`,
          segment: leads.segment,
          subject: drafts.subject,
          body: drafts.body,
          status: drafts.status,
          flags: drafts.flags,
          sentAt: sendLog.sentAt,
          threadId: sendLog.threadId,
          dryRun: sendLog.dryRun,
        })
        .from(leads)
        .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
        .leftJoin(contacts, eq(leads.contactId, contacts.id))
        .leftJoin(
          drafts,
          and(eq(drafts.leadId, leads.id), eq(drafts.isTest, false)),
        )
        .leftJoin(sendLog, eq(sendLog.draftId, drafts.id))
        .all()
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
              k,
              typeof v === "string" && /^[=+@-]/.test(v)
                ? `'${v}`
                : Array.isArray(v)
                  ? v.join(", ")
                  : (v ?? ""),
            ]),
          ),
        );
      const sheet = XLSX.utils.json_to_sheet(rows);
      const format = q.get("format") === "csv" ? "csv" : "xlsx";
      if (format === "csv")
        return new Response(XLSX.utils.sheet_to_csv(sheet), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=reachflow-results.csv",
          },
        });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Results");
      return new Response(
        new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" })),
        {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              "attachment; filename=reachflow-results.xlsx",
          },
        },
      );
    }
    const tally = (
      table:
        | typeof leads
        | typeof drafts
        | typeof contacts
        | typeof replyEvents
        | typeof sendLog,
      where?: ReturnType<typeof eq>,
    ) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(table)
        .where(where)
        .get()!.n;
    return Response.json({
      uploaded: db
        .select({ n: sql<number>`coalesce(sum(rowCount),0)` })
        .from(sql`sheets`)
        .get()!.n,
      cleaned: tally(leads),
      generated: tally(drafts, eq(drafts.isTest, false)),
      approved: tally(
        drafts,
        and(eq(drafts.isTest, false), eq(drafts.status, "approved")),
      ),
      sent: tally(
        sendLog,
        and(eq(sendLog.dryRun, false), eq(sendLog.status, "sent")),
      ),
      dryRun: tally(sendLog, eq(sendLog.status, "dry_run")),
      replied: tally(contacts, eq(contacts.status, "replied")),
      bounced: tally(contacts, eq(contacts.status, "bounced")),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    guard(request);
    const v = z
      .object({
        action: z.literal("suppress"),
        email: z.email(),
        reason: z.string().max(500).default("Manual opt-out"),
      })
      .parse(await jsonInput(request));
    suppress(v.email, v.reason);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
