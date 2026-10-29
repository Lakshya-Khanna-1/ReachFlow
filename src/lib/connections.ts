import { config, secret } from "./settings";
export async function testProvider(timeout = 15000) {
  const c = config();
  const key = secret("llmKey");
  const base =
    c.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : c.baseUrl.replace(/\/$/, "");
  const url =
    c.provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/models"
      : `${base}/models`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers:
        c.provider === "gemini"
          ? { "x-goog-api-key": key }
          : key
            ? { Authorization: `Bearer ${key}` }
            : {},
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error(
      "Cannot reach LLM. Start the local server or check the URL.",
    );
  }
  if (!response.ok)
    throw new Error(
      `Provider connection failed (HTTP ${response.status}). Check the endpoint and API key.`,
    );
}
