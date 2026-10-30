import { randomBytes, createHash } from "node:crypto";
import { guard, failure } from "@/lib/http";
import { oauth, GOOGLE_SCOPES } from "@/lib/gmail";
import { putSetting, getSetting } from "@/lib/settings";
export async function POST(request: Request) {
  try {
    guard(request);
    if (!request.headers.get("host")?.startsWith("localhost:"))
      throw new Error(
        "Open ReachFlow at http://localhost:3000 to connect Google; the OAuth callback uses localhost.",
      );
    const state = randomBytes(32).toString("hex");
    putSetting(
      "oauthState",
      JSON.stringify({
        hash: createHash("sha256").update(state).digest("hex"),
        expires: Date.now() + 600000,
      }),
    );
    const url = oauth().generateAuthUrl({
      login_hint: getSetting("googleLoginHint") || undefined,
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPES,
      state,
      include_granted_scopes: false,
    });
    return Response.json(
      { url },
      {
        headers: {
          "Set-Cookie": `rf_oauth=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600`,
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
