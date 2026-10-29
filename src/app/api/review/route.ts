import { z } from "zod";
import { and, eq, sql, inArray } from "drizzle-orm";
import { database } from "@/db";
import { drafts, leads, campaigns, templateVersions } from "@/db/schema";
import { guard, jsonInput, failure } from "@/lib/http";
import {
  currentVersion,
  generateDraft,
  spamFlags,
  deterministicGrounding,
  similarity,
} from "@/lib/generation";
import { approveTemplate, queueCampaign } from "@/lib/review";
import { analysisSchema } from "@/lib/contracts";
import { config } from "@/lib/settings";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const query = new URL(request.url).searchParams;
    const campaignId = z.uuid().parse(query.get("campaignId"));
    const db = database().db;
    const v = db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.campaignId, campaignId))
      .orderBy(sql`${templateVersions.createdAt} DESC`)
      .get();
    if (!v)
      return Response.json({
        version: null,
        rows: [],
        spot: [],
        counts: {},
        sample: "",
        mode: config().dryRun ? "dry run" : "real delivery",
        cap: config().dailyCap,
      });
    const filter = query.get("status") ?? "attention";
    const statuses = [
      "pending",
      "attention",
      "approved",
      "rejected",
      "sent",
      "failed",
      "uncertain",
      "sending",
    ];
    if (filter !== "all" && !statuses.includes(filter))
      throw new Error("Invalid status");
    const where = and(eq(drafts.versionId, v.id), eq(drafts.isTest, false));
    const rows = db
      .select({ draft: drafts, lead: leads.cleaned, segment: leads.segment })
      .from(drafts)
      .innerJoin(leads, eq(drafts.leadId, leads.id))
      .where(
        and(
          where,
          filter === "all"
            ? undefined
            : eq(drafts.status, filter as typeof drafts.$inferSelect.status),
        ),
      )
      .limit(5000)
      .all();
    const spot = db
      .select({ draft: drafts, lead: leads.cleaned, segment: leads.segment })
      .from(drafts)
      .innerJoin(leads, eq(drafts.leadId, leads.id))
      .where(where)
      .orderBy(sql`random()`)
      .limit(10)
      .all();
    const grouped = db
      .select({ status: drafts.status, n: sql<number>`count(*)` })
      .from(drafts)
      .where(where)
      .groupBy(drafts.status)
      .all();
    return Response.json({
      version: v,
      rows,
      spot,
      counts: Object.fromEntries(grouped.map((g) => [g.status, g.n])),
      sample: v.sample,
      mode: config().dryRun ? "dry run" : "real delivery",
      cap: config().dailyCap,
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
        campaignId: z.uuid(),
        action: z.enum([
          "approveTemplate",
          "queue",
          "approve",
          "reject",
          "edit",
          "regenerate",
        ]),
        ids: z.array(z.string()).max(5000).default([]),
        subject: z.string().min(1).max(200).optional(),
        body: z.string().min(1).max(12000).optional(),
        overwriteEdited: z.boolean().default(false),
        instruction: z.string().max(1000).default(""),
      })
      .parse(await jsonInput(request));
    const db = database().db;
    const version = currentVersion(v.campaignId);
    if (v.action === "approveTemplate") {
      approveTemplate(v.campaignId);
      return Response.json({ ok: true });
    }
    if (v.action === "queue") {
      if (
        !config().dryRun &&
        (!config().senderName.trim() || !config().noticeAccepted)
      )
        throw new Error(
          "Set your real sender name and acknowledge Gmail risks in Settings",
        );
      return Response.json({ queued: queueCampaign(v.campaignId) });
    }
    if (!v.ids.length) throw new Error("Select a draft");
    const items = db
      .select()
      .from(drafts)
      .where(
        and(
          inArray(drafts.id, v.ids),
          eq(drafts.versionId, version.id),
          eq(drafts.isTest, false),
        ),
      )
      .all();
    if (
      items.length !== v.ids.length ||
      items.some((d) => ["sending", "sent", "uncertain"].includes(d.status))
    )
      throw new Error("Some drafts cannot be changed in their current state");
    if (v.action === "approve" && !version.approved)
      throw new Error("Approve the master template first");
    if (v.action === "approve" || v.action === "reject") {
      if (
        v.action === "approve" &&
        items.some(
          (d) => !d.body.trim() || d.flags.includes("generation_error"),
        )
      )
        throw new Error("Regenerate failed drafts before approval");
      db.transaction((tx) =>
        tx
          .update(drafts)
          .set({ status: v.action === "approve" ? "approved" : "rejected" })
          .where(inArray(drafts.id, v.ids))
          .run(),
      );
      return Response.json({ ok: true });
    }
    if (items.length !== 1)
      throw new Error("Edit or regenerate one draft at a time");
    const item = items[0];
    const lead = db
      .select()
      .from(leads)
      .where(eq(leads.id, item.leadId))
      .get()!;
    const campaign = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, v.campaignId))
      .get()!;
    if (v.action === "edit") {
      const content = {
        subject: z.string().min(1).parse(v.subject),
        body: z.string().min(1).parse(v.body),
        used_fields: item.usedFields,
        confidence: item.confidence,
        notes: item.notes,
      };
      const flags = [
        "edited_review",
        ...spamFlags(
          content,
          campaign.minWords,
          campaign.maxWords,
          campaign.bannedPhrases,
          config().footer,
        ),
        ...deterministicGrounding(content, lead.cleaned, campaign.sample),
      ];
      db.transaction((tx) =>
        tx
          .update(drafts)
          .set({
            subject: content.subject,
            body: content.body,
            edited: true,
            flags,
            status: "attention",
          })
          .where(eq(drafts.id, item.id))
          .run(),
      );
      return Response.json({ ok: true });
    }
    if (item.edited && !v.overwriteEdited)
      throw new Error("Confirm before overwriting an edited draft");
    const generated = await generateDraft(
      {
        ...campaign,
        brief:
          campaign.brief +
          "\nRevision instruction (never invent facts): " +
          v.instruction,
      },
      analysisSchema.parse(JSON.parse(version.analysis)),
      lead.cleaned,
      config().footer,
    );
    if (
      db
        .select({ body: drafts.body })
        .from(drafts)
        .where(
          and(
            eq(drafts.versionId, version.id),
            sql`${drafts.id} != ${item.id}`,
            eq(drafts.isTest, false),
          ),
        )
        .all()
        .some((d) => similarity(d.body, generated.body) > 0.85)
    )
      generated.flags.push("near_duplicate");
    db.transaction((tx) => {
      const current = tx
        .select()
        .from(drafts)
        .where(eq(drafts.id, item.id))
        .get()!;
      if (
        ["sending", "sent", "uncertain"].includes(current.status) ||
        current.body !== item.body
      )
        throw new Error(
          "Draft changed while regenerating; reload before retrying",
        );
      tx.update(drafts)
        .set({
          subject: generated.subject,
          body: generated.body,
          flags: generated.flags,
          confidence: generated.confidence,
          usedFields: generated.used_fields,
          notes: generated.notes,
          edited: false,
          status: "attention",
        })
        .where(eq(drafts.id, item.id))
        .run();
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
