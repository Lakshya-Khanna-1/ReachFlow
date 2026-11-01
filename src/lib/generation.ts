import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { database } from "../db";
import { campaigns, leads, templateVersions, drafts, jobs } from "../db/schema";
import {
  analysisSchema,
  generatedSchema,
  type Generated,
  type Analysis,
} from "./contracts";
import { structured, type LLMProvider } from "./llm";
import { config, getSetting } from "./settings";
import { mxValid } from "./mx";
import { selectWritingExamples } from "./writing-examples";
export function spamFlags(
  draft: Generated,
  min: number,
  max: number,
  banned: string[],
  footer: string,
) {
  const flags: string[] = [];
  const words = draft.body.trim().split(/\s+/).length;
  if (words < min || words > max) flags.push(`word_count:${words}`);
  if (draft.subject.length > 70 || /[\r\n]/.test(draft.subject))
    flags.push("subject");
  if ((draft.body.match(/https?:\/\//gi) ?? []).length > 1)
    flags.push("too_many_links");
  if (/bit\.ly|tinyurl\.com|t\.co\//i.test(draft.body))
    flags.push("shortened_link");
  if (/FREE MONEY|guaranteed|act now|limited time|!!!|\$\$\$/i.test(draft.body))
    flags.push("spam_language");
  if (/\b[A-Z]{5,}\b/.test(draft.subject + " " + draft.body))
    flags.push("excessive_caps");
  if (banned.some((p) => draft.body.toLowerCase().includes(p.toLowerCase())))
    flags.push("banned_phrase");
  if (draft.confidence < 0.85) flags.push("low_confidence");
  if (!footer.trim()) flags.push("missing_opt_out");
  return flags;
}
export function similarity(a: string, b: string) {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );
  const x = tokens(a),
    y = tokens(b);
  let common = 0;
  for (const token of x) if (y.has(token)) common++;
  return common / (x.size + y.size - common || 1);
}
export function deterministicGrounding(
  draft: Generated,
  row: Record<string, string>,
  sample: string,
) {
  const source = (Object.values(row).join(" ") + " " + sample).toLowerCase();
  const flags: string[] = [];
  for (const n of (draft.body + " " + draft.subject).match(
    /\b\d+(?:[.,]\d+)*(?:%|\b)/g,
  ) ?? [])
    if (!source.includes(n.toLowerCase()))
      flags.push(`unsupported_number:${n}`);
  if (
    /award.winning|industry.leading|fastest.growing|I (?:saw|read|visited|noticed)|your (?:recent|latest|new) /i.test(
      draft.body,
    ) &&
    !Object.values(row).some((v) =>
      /award|industry|recent|latest|new|growth/i.test(v),
    )
  )
    flags.push("unsupported_observation");
  for (const field of draft.used_fields)
    if (!row[field]?.trim()) flags.push(`missing_source:${field}`);
  return flags;
}
export async function generateDraft(
  campaign: typeof campaigns.$inferSelect,
  analysis: Analysis,
  row: Record<string, string>,
  footer: string,
  llm?: LLMProvider,
) {
  const r = await structured(
    generatedSchema.extend({
      used_fields: z.array(z.enum(Object.keys(row))),
    }),
    `Personalize one first-contact email. Return {subject,body,used_fields:[],confidence:0..1,notes}. Keep subject at most 70 characters. Body must be ${campaign.minWords}–${campaign.maxWords} words; aim for ${Math.round((campaign.minWords + campaign.maxWords) / 2)}. Use ONLY recipient facts from row. Preserve the analysis core_message and cta, and fixed phrases verbatim. Thin data: use neutral sample wording. Never claim visits, achievements or familiarity. Writing examples demonstrate concise, formal style only: never copy their recipient names or facts. Follow the current brief and row for the offer and recipient. No placeholders or opt-out footer in output.`,
    JSON.stringify({
      brief: campaign.brief,
      sample: campaign.sample,
      tone: campaign.tone,
      minWords: campaign.minWords,
      maxWords: campaign.maxWords,
      analysis,
      row,
      writingExamples: selectWritingExamples(
        getSetting("writingExamples"),
        row,
      ),
    }),
    llm,
  );
  const value = r.value;
  const mxOk = await mxValid(row.email ?? "");
  const flags = [
    ...(mxOk ? [] : ["invalid_or_unreachable_mx"]),
    ...spamFlags(
      value,
      campaign.minWords,
      campaign.maxWords,
      campaign.bannedPhrases,
      footer,
    ),
    ...deterministicGrounding(value, row, campaign.sample),
  ];
  for (const phrase of analysis.fixed_phrases)
    if (!value.body.includes(phrase)) flags.push("fixed_phrase_missing");
  if (/\{\{.*?\}\}/.test(value.body)) flags.push("unfilled_placeholder");
  const check = await structured(
    z.object({
      claims: z.array(
        z.object({
          claim: z.string(),
          field: z.string(),
          evidence: z.string(),
          supported: z.boolean(),
        }),
      ),
      unsupported_claims: z.array(z.string()),
    }),
    "Verify ALL recipient-specific claims in this email against row. Return {claims:[{claim,field,evidence,supported}],unsupported_claims:[]}. Evidence must be an exact substring of row[field]. Greetings and neutral offers are not factual claims. Flag fabricated facts even if plausible.",
    JSON.stringify({ row, subject: value.subject, body: value.body }),
    llm,
  );
  if (
    check.value.unsupported_claims.length ||
    check.value.claims.some(
      (c) =>
        !c.supported ||
        !c.evidence.trim() ||
        !row[c.field]?.includes(c.evidence),
    )
  )
    flags.push("grounding");
  if (
    Object.entries(row).filter(([k, v]) => k !== "email" && v.trim()).length < 2
  )
    flags.push("thin_data_review");
  return {
    ...value,
    body: value.body.trim() + (footer.trim() ? `\n\n${footer.trim()}` : ""),
    flags: [...new Set(flags)],
    tokens: r.tokens + check.tokens,
  };
}
export function currentVersion(campaignId: string, connection = database()) {
  const v = connection.db
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.campaignId, campaignId))
    .orderBy(desc(templateVersions.createdAt))
    .get();
  if (!v) throw new Error("Analyze and save a template first");
  return v;
}
export async function testRun(
  campaignId: string,
  llm?: LLMProvider,
  connection = database(),
) {
  const db = connection.db;
  const campaign = db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get();
  if (!campaign) throw new Error("Campaign not found");
  const v = currentVersion(campaignId, connection);
  const rows = db
    .select()
    .from(leads)
    .where(eq(leads.campaignId, campaignId))
    .orderBy(sql`random()`)
    .limit(3)
    .all();
  if (!rows.length) throw new Error("Import leads first");
  const results: {
    lead: typeof leads.$inferSelect;
    result: Awaited<ReturnType<typeof generateDraft>>;
  }[] = [];
  for (const lead of rows) {
    const result = await generateDraft(
      campaign,
      analysisSchema.parse(JSON.parse(v.analysis)),
      lead.cleaned,
      config().footer,
      llm,
    );
    results.push({ lead, result });
  }
  db.transaction((tx) => {
    tx.delete(drafts)
      .where(and(eq(drafts.versionId, v.id), eq(drafts.isTest, true)))
      .run();
    for (const { lead, result } of results)
      tx.insert(drafts)
        .values({
          id: randomUUID(),
          campaignId,
          leadId: lead.id,
          versionId: v.id,
          subject: result.subject,
          body: result.body,
          usedFields: result.used_fields,
          confidence: result.confidence,
          notes: result.notes,
          flags: result.flags,
          status: result.flags.length ? "attention" : "pending",
          idempotencyKey: randomUUID(),
          isTest: true,
        })
        .run();
    tx.update(templateVersions)
      .set({ testedAt: Date.now() })
      .where(eq(templateVersions.id, v.id))
      .run();
  });
  return results;
}
export function startGeneration(campaignId: string, connection = database()) {
  const db = connection.db;
  const version = currentVersion(campaignId, connection);
  if (!version.testedAt) throw new Error("Run the three-recipient test first");
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.campaignId, campaignId),
          sql`${jobs.status} IN ('running','paused')`,
        ),
      )
      .get();
    if (existing)
      throw new Error(
        "A generation job already exists. Resume it or cancel it.",
      );
    const total = tx
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.campaignId, campaignId))
      .get()!.n;
    if (!total) throw new Error("Import leads first");
    tx.update(campaigns)
      .set({ status: "generating" })
      .where(eq(campaigns.id, campaignId))
      .run();
    return tx
      .insert(jobs)
      .values({
        id: randomUUID(),
        campaignId,
        total,
        status: "running",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  });
}
export async function generationStep(
  connection = database(),
  llm?: LLMProvider,
  footer = config().footer,
) {
  const db = connection.db;
  const job = db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "running"))
    .orderBy(jobs.createdAt)
    .get();
  if (!job) return false;
  const campaign = db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, job.campaignId))
    .get()!;
  const v = currentVersion(campaign.id, connection);
  const lead = db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.campaignId, campaign.id),
        sql`NOT EXISTS (SELECT 1 FROM drafts WHERE drafts.leadId = ${leads.id} AND drafts.versionId = ${v.id} AND drafts.isTest = 0)`,
      ),
    )
    .get();
  if (!lead) {
    db.transaction((tx) => {
      tx.update(jobs)
        .set({ status: "complete" })
        .where(eq(jobs.id, job.id))
        .run();
      tx.update(campaigns)
        .set({ status: "review" })
        .where(eq(campaigns.id, campaign.id))
        .run();
    });
    return true;
  }
  let result: Awaited<ReturnType<typeof generateDraft>> | undefined;
  let error = "";
  try {
    result = await generateDraft(
      campaign,
      analysisSchema.parse(JSON.parse(v.analysis)),
      lead.cleaned,
      footer,
      llm,
    );
    const previous = db
      .select({ body: drafts.body })
      .from(drafts)
      .where(
        and(
          eq(drafts.campaignId, campaign.id),
          eq(drafts.versionId, v.id),
          eq(drafts.isTest, false),
        ),
      )
      .all();
    if (previous.some((p) => similarity(p.body, result!.body) > 0.85))
      result.flags.push("near_duplicate");
  } catch (e) {
    error = e instanceof Error ? e.message : "Generation failed";
  }
  db.transaction((tx) => {
    const active = tx.select().from(jobs).where(eq(jobs.id, job.id)).get();
    if (
      active?.status !== "running" ||
      currentVersion(campaign.id, connection).id !== v.id
    )
      return;
    tx.insert(drafts)
      .values({
        id: randomUUID(),
        campaignId: campaign.id,
        leadId: lead.id,
        versionId: v.id,
        subject: result?.subject ?? "Generation failed",
        body: result?.body ?? "",
        usedFields: result?.used_fields ?? [],
        confidence: result?.confidence ?? 0,
        notes: error || result?.notes || "",
        flags: result?.flags ?? ["generation_error"],
        status: result
          ? result.flags.length
            ? "attention"
            : v.approved
              ? "approved"
              : "pending"
          : "failed",
        idempotencyKey: randomUUID(),
      })
      .onConflictDoNothing()
      .run();
    tx.update(jobs)
      .set({
        completed: sql`${jobs.completed}+1`,
        errors: sql`${jobs.errors}+${error ? 1 : 0}`,
        tokens: sql`${jobs.tokens}+${result?.tokens ?? 0}`,
        lastError: error || null,
      })
      .where(eq(jobs.id, job.id))
      .run();
  });
  return true;
}
