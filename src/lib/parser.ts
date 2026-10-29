import * as XLSX from "xlsx";
import { z } from "zod";
export const parsedSheetSchema = z.object({
  name: z.string(),
  headers: z.array(z.string()),
  originalHeaders: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string())),
  blankRows: z.number(),
});
export type ParsedSheet = z.infer<typeof parsedSheetSchema>;
export function parseWorkbook(buffer: Buffer, name: string): ParsedSheet[] {
  if (buffer.length > 20 * 1024 * 1024) throw new Error("Upload exceeds 20 MB");
  if (!/\.(xlsx|xls|csv|tsv|json)$/i.test(name))
    throw new Error("Use XLSX, XLS, CSV, TSV or JSON");
  let book: XLSX.WorkBook;
  if (/\.json$/i.test(name)) {
    const raw = z
      .array(
        z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()]),
        ),
      )
      .max(50000)
      .parse(JSON.parse(buffer.toString("utf8")));
    book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(raw), "Pasted");
  } else
    book = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      sheetRows: 50002,
    });
  let total = 0;
  return book.SheetNames.map((name) => {
    const range = book.Sheets[name]["!fullref"] ?? book.Sheets[name]["!ref"];
    if (range && XLSX.utils.decode_range(range).e.r > 50001)
      throw new Error("Maximum 50,000 rows per upload");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const scores = matrix
      .slice(0, 20)
      .map(
        (row) =>
          row.filter((v) =>
            /^(e.?mail(?: address)?|full.?name|name|company|business|person|contact(?: email)?|website|role|notes)$/i.test(
              String(v).trim(),
            ),
          ).length,
      );
    let headerIndex =
      Math.max(...scores) > 0 ? scores.indexOf(Math.max(...scores)) : -1;
    if (headerIndex < 0)
      headerIndex = matrix.findIndex(
        (r) => r.filter((v) => String(v).trim()).length >= 2,
      );
    if (headerIndex < 0) headerIndex = 0;
    const originalHeaders = (matrix[headerIndex] ?? []).map(
      (v, i) => String(v).trim() || `Column ${i + 1}`,
    );
    if (originalHeaders.length > 200) throw new Error("Maximum 200 columns");
    const seen = new Map<string, number>();
    const headers = originalHeaders.map((v) => {
      const base =
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "") || "column";
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n ? `${base}_${n + 1}` : base;
    });
    let blankRows = 0;
    const rows: Record<string, string>[] = [];
    for (const row of matrix.slice(headerIndex + 1)) {
      if (!row.some((v) => String(v).trim())) {
        blankRows++;
        continue;
      }
      const result: Record<string, string> = {};
      headers.forEach((header, i) => {
        result[header] = String(row[i] ?? "")
          .trim()
          .slice(0, 4000);
      });
      rows.push(result);
    }
    total += rows.length;
    if (total > 50000)
      throw new Error("Maximum 50,000 nonblank rows per upload");
    return { name, headers, originalHeaders, rows, blankRows };
  });
}
