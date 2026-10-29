import { z } from "zod";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import { dailyCounters } from "@/db/schema";
import { guard, jsonInput, failure } from "@/lib/http";
import { config, getSetting } from "@/lib/settings";
import { state, setState, reconcile } from "@/lib/dispatcher";
import { localParts, warmupCap } from "@/lib/schedule";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const c = config();
    const date = localParts(new Date(), c.timezone).date;
    const prefix = c.dryRun ? "dry:" : "";
    const counter = database()
      .db.select()
      .from(dailyCounters)
      .where(eq(dailyCounters.localDate, prefix + date))
      .get();
    return Response.json({
      status: getSetting("pauseReason") || state("status") || "Starting",
      paused: state("paused") === "true",
      nextSendAt: Number(state("nextSendAt")) || null,
      sentToday: counter?.sentCount ?? 0,
      cap: Math.min(
        c.dailyCap,
        counter?.capApplied ??
          warmupCap(
            c,
            date,
            state(prefix + "warmupStart"),
            state(prefix + "lastSentDate"),
          ),
      ),
      dryRun: c.dryRun,
      heartbeat: Number(state("heartbeat")) || null,
      lastError: state("replyError") || state("lastError"),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    guard(request);
    const v = z
      .object({ action: z.enum(["pause", "resume", "reconcile"]) })
      .parse(await jsonInput(request));
    if (v.action === "reconcile") {
      if (state("paused") !== "true")
        throw new Error("Pause sending before manual reconciliation");
      return Response.json({ checked: await reconcile() });
    }
    if (v.action === "resume" && getSetting("pauseReason"))
      throw new Error(getSetting("pauseReason"));
    setState("paused", String(v.action === "pause"));
    setState("status", v.action === "pause" ? "Paused by you" : "Resuming");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
