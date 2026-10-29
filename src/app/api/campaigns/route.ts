import { database } from "@/db";
import { campaigns } from "@/db/schema";
import { createCampaign } from "@/db/repository";
import { guard, jsonInput, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    return Response.json(database().db.select().from(campaigns).all());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    guard(request);
    return Response.json(createCampaign(await jsonInput(request)));
  } catch (e) {
    return failure(e);
  }
}
