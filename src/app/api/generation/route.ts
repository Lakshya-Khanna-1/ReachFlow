import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { database } from "@/db";
import { jobs } from "@/db/schema";
import { testRun, startGeneration } from "@/lib/generation";
import { guard, jsonInput, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("campaignId"));
    return Response.json({
      job:
        database()
          .db.select()
          .from(jobs)
          .where(eq(jobs.campaignId, id))
          .orderBy(desc(jobs.createdAt))
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
        action: z.enum(["test", "generate", "pause", "resume", "cancel"]),
      })
      .parse(await jsonInput(request));
    if (v.action === "test")
      return Response.json({ results: await testRun(v.campaignId) });
    if (v.action === "generate")
      return Response.json({ job: startGeneration(v.campaignId) });
    const db = database().db;
    const job = db
      .select()
      .from(jobs)
      .where(eq(jobs.campaignId, v.campaignId))
      .orderBy(desc(jobs.createdAt))
      .get();
    if (!job || !["running", "paused"].includes(job.status))
      throw new Error("No active generation job");
    db.transaction((tx) =>
      tx
        .update(jobs)
        .set({
          status:
            v.action === "pause"
              ? "paused"
              : v.action === "resume"
                ? "running"
                : "cancelled",
        })
        .where(eq(jobs.id, job.id))
        .run(),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
