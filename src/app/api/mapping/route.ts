import { z } from "zod";
import { guard, jsonInput, failure } from "@/lib/http";
import { readUpload } from "@/lib/ingestion";
import { proposeMapping } from "@/lib/mapping";
export async function POST(request: Request) {
  try {
    guard(request);
    const v = z
      .object({
        uploadId: z.uuid(),
        sheetIndex: z.number().int().nonnegative(),
      })
      .parse(await jsonInput(request));
    const sheet = readUpload(v.uploadId)[v.sheetIndex];
    if (!sheet) throw new Error("Sheet not found");
    return Response.json({
      mapping: await proposeMapping(sheet.headers, sheet.rows.slice(0, 5)),
    });
  } catch (e) {
    return failure(e);
  }
}
