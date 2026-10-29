import { config, secret } from "@/lib/settings";
import { guard, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    guard(request);
    const c = config();
    const apiKey = secret("llmKey");
    const base =
      c.provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : c.baseUrl.replace(/\/$/, "");
    const url =
      c.provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/models"
        : `${base}/models`;
    const response = await fetch(url, {
      headers:
        c.provider === "gemini"
          ? { "x-goog-api-key": apiKey }
          : apiKey
            ? { Authorization: `Bearer ${apiKey}` }
            : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Provider connection failed (HTTP ${response.status}). Check the endpoint, key and model.`,
      );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(
      e instanceof TypeError
        ? new Error(
            "Cannot reach LLM. Start your local server or check the URL.",
          )
        : e,
    );
  }
}
