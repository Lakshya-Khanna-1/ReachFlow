import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { database } from "@/db";
import { campaigns, templateVersions } from "@/db/schema";
import { campaignSchema, analysisSchema } from "@/lib/contracts";
import { analyzeTemplate, saveTemplate } from "@/lib/templates";
import { guard, jsonInput, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("campaignId"));
    const db = database().db;
    return Response.json({
      campaign: db.select().from(campaigns).where(eq(campaigns.id, id)).get(),
      version:
        db
          .select()
          .from(templateVersions)
          .where(eq(templateVersions.campaignId, id))
          .orderBy(desc(templateVersions.createdAt))
          .get() ?? null,
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
        campaign: campaignSchema,
        analysis: analysisSchema.optional(),
        action: z.enum(["analyze", "save"]),
      })
      .parse(await jsonInput(request));
    if (!v.campaign.sample.trim()) throw new Error("Add a sample email");
    const analysis =
      v.action === "analyze"
        ? await analyzeTemplate(v.campaign.brief, v.campaign.sample)
        : analysisSchema.parse(v.analysis);
    const version = saveTemplate(v.campaignId, v.campaign, analysis);
    return Response.json({ version, analysis });
  } catch (e) {
    return failure(e);
  }
}
