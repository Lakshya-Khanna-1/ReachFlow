import { publicConfig, saveConfig } from "@/lib/settings";
import { guard, jsonInput, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    return Response.json(publicConfig());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    guard(request);
    saveConfig(await jsonInput(request));
    return Response.json(publicConfig());
  } catch (e) {
    return failure(e);
  }
}
