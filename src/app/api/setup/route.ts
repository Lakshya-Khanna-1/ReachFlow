import { database } from "@/db";
import { sheets, templateVersions } from "@/db/schema";
import { config, getSetting } from "@/lib/settings";
import { guard, failure } from "@/lib/http";
import { testProvider } from "@/lib/connections";
import { gmail, GOOGLE_SCOPES, gmailFailure } from "@/lib/gmail";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const c = config();
    const db = database().db;
    let reachable = false;
    let connected = false;
    try {
      await testProvider(2000);
      reachable = true;
    } catch {}
    if (getSetting("googleToken"))
      try {
        await gmail().users.getProfile(
          { userId: "me" },
          { retry: false, timeout: 5000 },
        );
        connected = GOOGLE_SCOPES.every((s) =>
          (getSetting("googleScopes") ?? "").split(" ").includes(s),
        );
      } catch (e) {
        try {
          gmailFailure(e);
        } catch {}
      }
    return Response.json({
      items: [
        { label: "LLM reachable", ok: reachable },
        {
          label: "Google connected with required scopes",
          ok: connected,
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
