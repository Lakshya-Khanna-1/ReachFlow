import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { guard, failure } from "@/lib/http";
import { getSetting, putSetting } from "@/lib/settings";
import { connectGoogle } from "@/lib/gmail";
export async function GET(request: Request) {
  try {
    guard(request);
    const url = new URL(request.url);
    const state = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(url.searchParams.get("state"));
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("rf_oauth="))
      ?.slice(9);
    const stored = z
      .object({ hash: z.string(), expires: z.number() })
      .parse(JSON.parse(getSetting("oauthState") ?? "{}"));
    const hash = createHash("sha256").update(state).digest("hex");
    if (
      cookie !== state ||
      stored.expires < Date.now() ||
      stored.hash.length !== hash.length ||
      !timingSafeEqual(Buffer.from(stored.hash), Buffer.from(hash))
    )
      throw new Error(
        "OAuth state invalid or expired. Start Google connection again.",
      );
    putSetting("oauthState", "");
    const code = z.string().min(1).parse(url.searchParams.get("code"));
    await connectGoogle(code);
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/settings?google=connected",
        "Set-Cookie":
          "rf_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
