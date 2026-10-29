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
  const text = await request.text();
  if (Buffer.byteLength(text) > 1_000_000) throw new Error("Request too large");
  return JSON.parse(text) as unknown;
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
