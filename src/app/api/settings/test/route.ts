import { testProvider } from "@/lib/connections";
import { guard, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    guard(request);
    await testProvider();
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
