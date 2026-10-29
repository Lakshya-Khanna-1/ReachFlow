import { database } from "@/db";
import { sheets, templateVersions } from "@/db/schema";
import { config, getSetting } from "@/lib/settings";
import { guard, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const c = config();
    const db = database().db;
    let reachable = false;
    try {
      const url =
        c.provider === "local"
          ? `${c.baseUrl.replace(/\/$/, "")}/models`
          : c.provider === "gemini"
            ? "https://generativelanguage.googleapis.com"
            : "https://openrouter.ai";
      reachable = (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {}
    return Response.json({
      items: [
        { label: "LLM reachable", ok: reachable },
        {
          label: "Google connected with required scopes",
          ok: !!getSetting("googleToken"),
        },
        { label: "Forward-to addresses set", ok: c.forwardTo.length > 0 },
        { label: "Test email sent", ok: !!getSetting("testEmailSent") },
        { label: "Sheet uploaded", ok: !!db.select().from(sheets).get() },
        {
          label: "Template approved",
          ok: db
            .select()
            .from(templateVersions)
            .all()
            .some((v) => v.approved),
        },
      ],
    });
  } catch (e) {
    return failure(e);
  }
}
