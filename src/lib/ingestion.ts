import { Worker } from "node:worker_threads";
import { resolve, join, dirname } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parsedSheetSchema, type ParsedSheet } from "./parser";
import { database } from "../db";
import { sheets, leads, contacts, suppression, campaigns } from "../db/schema";
import { emailSchema } from "./contracts";
import { eq } from "drizzle-orm";
const uploadDir = () =>
  join(dirname(process.env.DATABASE_PATH ?? "./data/reachflow.db"), "uploads");
export async function parseUpload(buffer: Buffer, name: string) {
  return new Promise<ParsedSheet[]>((resolvePromise, reject) => {
    const worker = new Worker(resolve("src/lib/parse-worker.ts"), {
      workerData: { buffer, name },
      execArgv: ["--import", "tsx"],
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Parsing timed out"));
    }, 60000);
    worker.once("message", (message: unknown) => {
      clearTimeout(timer);
      const parsed = z
        .object({
          sheets: z.array(parsedSheetSchema).optional(),
          error: z.string().optional(),
        })
        .parse(message);
      if (parsed.error) reject(new Error(parsed.error));
      else resolvePromise(parsed.sheets ?? []);
    });
    worker.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
export function cacheUpload(value: ParsedSheet[]) {
  const id = randomUUID();
  mkdirSync(uploadDir(), { recursive: true });
  writeFileSync(join(uploadDir(), `${id}.json`), JSON.stringify(value));
  return id;
}
export function readUpload(id: string) {
  z.uuid().parse(id);
  return z
    .array(parsedSheetSchema)
    .parse(JSON.parse(readFileSync(join(uploadDir(), `${id}.json`), "utf8")));
}
export function ingest(
  campaignId: string,
  selected: ParsedSheet[],
  connection = database(),
) {
  const report = {
    imported: 0,
    invalid: 0,
    duplicates: 0,
    alreadyContacted: 0,
    blankRows: 0,
    details: [] as string[],
  };
  connection.db.transaction((tx) => {
    if (!tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get())
      throw new Error("Campaign not found");
    const known = new Set(
      tx
        .select({ email: contacts.email })
        .from(contacts)
        .all()
        .map((c) => c.email),
    );
    for (const s of tx.select().from(suppression).all()) known.add(s.email);
    const seen = new Set<string>();
    for (const sheet of selected) {
      const sheetId = randomUUID();
      tx.insert(sheets)
        .values({
          id: sheetId,
          campaignId,
          name: sheet.name,
          headers: sheet.headers,
          rowCount: sheet.rows.length,
        })
        .run();
      report.blankRows += sheet.blankRows;
      const emailColumn =
        sheet.headers.find((h) => /e_?mail/i.test(h)) ??
        sheet.headers.find((h) =>
          sheet.rows
            .slice(0, 5)
            .some((r) => emailSchema.safeParse(r[h]).success),
        );
      for (const [rowIndex, row] of sheet.rows.entries()) {
        const value = emailSchema.safeParse(
          emailColumn ? row[emailColumn] : "",
        );
        if (!value.success) {
          report.invalid++;
          if (report.details.length < 100)
            report.details.push(
              `${sheet.name} row ${rowIndex + 2}: invalid or missing email`,
            );
          continue;
        }
        const email = value.data;
        if (seen.has(email)) {
          report.duplicates++;
          continue;
        }
        seen.add(email);
        if (known.has(email)) {
          report.alreadyContacted++;
          continue;
        }
        const id = randomUUID();
        tx.insert(contacts).values({ id, email }).run();
        tx.insert(leads)
          .values({
            id: randomUUID(),
            campaignId,
            sheetId,
            contactId: id,
            raw: row,
            cleaned: { ...row, email },
            segment: sheet.name,
          })
          .run();
        report.imported++;
      }
    }
  });
  return report;
}
