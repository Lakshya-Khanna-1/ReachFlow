import { eq, count } from "drizzle-orm";
import { database } from "@/db";
import { campaigns, sheets, leads, columnMappings } from "@/db/schema";
import { z } from "zod";
import { guard, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    guard(request);
    const { id } = await params;
    z.uuid().parse(id);
    const db = database().db;
    const campaign = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .get();
    if (!campaign) throw new Error("Campaign not found");
    return Response.json({
      campaign,
      sheets: db.select().from(sheets).where(eq(sheets.campaignId, id)).all(),
      mappings: db
        .select({ sheet: sheets.name, mapping: columnMappings.mapping })
        .from(sheets)
        .innerJoin(columnMappings, eq(sheets.id, columnMappings.sheetId))
        .where(eq(sheets.campaignId, id))
        .all(),
      leadCount:
        db
          .select({ n: count() })
          .from(leads)
          .where(eq(leads.campaignId, id))
          .get()?.n ?? 0,
    });
  } catch (e) {
    return failure(e);
  }
}
