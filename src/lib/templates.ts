import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { database } from "../db";
import {
  campaigns,
  templateAnalyses,
  templateVersions,
  drafts,
  jobs,
} from "../db/schema";
import { campaignSchema, analysisSchema, type Analysis } from "./contracts";
import { structured, type LLMProvider } from "./llm";
export async function analyzeTemplate(
  brief: string,
  sample: string,
  llm?: LLMProvider,
) {
  const result = await structured(
    analysisSchema,
    "Analyze this outreach template. Return {core_message,cta,fixed_phrases:[],variable_slots:[{name,description,source_hints:[],fallback}]}. Preserve explicit {{placeholders}} as variable slots. If no placeholders infer greeting/business reference slots. Fixed phrases must be verbatim sample substrings. Never invent recipient facts.",
    JSON.stringify({ brief, sample }),
    llm,
  );
  const value = result.value;
  value.fixed_phrases = value.fixed_phrases.filter((p) => sample.includes(p));
  for (const match of sample.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = match[1].trim();
    if (!value.variable_slots.some((s) => s.name === name))
      value.variable_slots.push({
        name,
        description: `Value for ${name}`,
        source_hints: [name],
        fallback: "",
      });
  }
  return value;
}
export function saveTemplate(
  campaignId: string,
  input: unknown,
  analysis: Analysis,
) {
  const data = campaignSchema.parse(input);
  analysisSchema.parse(analysis);
  const c = database();
  return c.db.transaction((tx) => {
    if (
      tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.campaignId, campaignId),
            inArray(jobs.status, ["running", "paused"]),
          ),
        )
        .get()
    )
      throw new Error(
        "Cancel the active generation job before editing its template",
      );
    if (!tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get())
      throw new Error("Campaign not found");
    if (
      tx
        .select()
        .from(drafts)
        .where(
          and(eq(drafts.campaignId, campaignId), eq(drafts.status, "sending")),
        )
        .get()
    )
      throw new Error(
        "Pause sending and wait for the current send before editing the template",
      );
    tx.update(campaigns)
      .set({ ...data, status: "draft" })
      .where(eq(campaigns.id, campaignId))
      .run();
    tx.update(templateVersions)
      .set({ approved: false })
      .where(eq(templateVersions.campaignId, campaignId))
      .run();
    tx.update(drafts)
      .set({ status: "pending" })
      .where(
        and(
          eq(drafts.campaignId, campaignId),
          inArray(drafts.status, ["approved", "attention"]),
        ),
      )
      .run();
    tx.insert(templateAnalyses)
      .values({ campaignId, analysis })
      .onConflictDoUpdate({
        target: templateAnalyses.campaignId,
        set: { analysis },
      })
      .run();
    return tx
      .insert(templateVersions)
      .values({
        id: randomUUID(),
        campaignId,
        analysis: JSON.stringify(analysis),
        sample: data.sample,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  });
}
