import { z } from "zod";
import { parseUpload, cacheUpload, readUpload, ingest } from "@/lib/ingestion";
import { guard, jsonInput, failure, limitedBody } from "@/lib/http";
import { heuristicMapping, mappingSchema } from "@/lib/mapping";
export async function POST(request: Request) {
  try {
    guard(request);
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      const v = z
        .object({
          campaignId: z.uuid(),
          uploadId: z.uuid(),
          selected: z.array(z.number().int().nonnegative()).min(1),
          mappings: z.record(z.string(), mappingSchema).default({}),
        })
        .parse(await jsonInput(request));
      const all = readUpload(v.uploadId);
      const selected = [...new Set(v.selected)].map((i) => {
        if (!all[i]) throw new Error("Invalid sheet selection");
        return all[i];
      });
      return Response.json(
        ingest(
          v.campaignId,
          selected,
          undefined,
          [...new Set(v.selected)].map(
            (i) => v.mappings[String(i)] ?? heuristicMapping(all[i].headers),
          ),
        ),
      );
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 21 * 1024 * 1024) throw new Error("Upload exceeds 20 MB");
    const bytes = await limitedBody(request, 21 * 1024 * 1024);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    const paste = form.get("paste");
    let buffer: Buffer;
    let name: string;
    if (file instanceof File) {
      if (file.size > 20 * 1024 * 1024) throw new Error("Upload exceeds 20 MB");
      buffer = Buffer.from(await file.arrayBuffer());
      name = file.name;
    } else if (typeof paste === "string") {
      buffer = Buffer.from(paste);
      name = paste.trim().startsWith("[") ? "paste.json" : "paste.tsv";
    } else throw new Error("Choose a file or paste rows");
    const sheets = await parseUpload(buffer, name);
    const uploadId = cacheUpload(sheets);
    return Response.json({
      uploadId,
      sheets: sheets.map((s) => ({
        name: s.name,
        headers: s.headers,
        originalHeaders: s.originalHeaders,
        count: s.rows.length,
        blankRows: s.blankRows,
        preview: s.rows.slice(0, 5),
        mapping: heuristicMapping(s.headers),
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
