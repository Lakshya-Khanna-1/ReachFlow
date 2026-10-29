import { ZodError } from "zod";
export function guard(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const port = process.env.PORT ?? "3000";
  const allowed = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!allowed.includes(host)) throw new Error("Untrusted host");
  if (
    !["GET", "HEAD"].includes(request.method) &&
    !allowed
      .map((h) => `http://${h}`)
      .includes(request.headers.get("origin") ?? "")
  )
    throw new Error("Untrusted origin");
}
export async function jsonInput(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Expected JSON");
  const bytes = await limitedBody(request, 1_000_000);
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error("Invalid JSON body");
  }
}
export async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export function failure(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : error instanceof Error
        ? error.message
        : "Request failed";
  return Response.json(
    { error: message },
    { status: message.startsWith("Untrusted") ? 403 : 400 },
  );
}
