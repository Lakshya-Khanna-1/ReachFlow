import { z } from "zod";
import { structured, type LLMProvider } from "./llm";
export const mappingSchema = z.record(z.string(), z.string());
const patterns: Record<string, RegExp> = {
  email: /e_?mail|mail_address|contact_email/,
  name: /^(full_?name|name|person|contact_name)$/,
  company: /company|business|organization|organisation/,
  role: /role|title|position/,
  website: /website|url|domain/,
  notes: /notes|description|about/,
};
export function heuristicMapping(headers: string[]) {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const field = Object.keys(patterns).find((key) =>
      patterns[key].test(header),
    );
    mapping[header] =
      field && !Object.values(mapping).includes(field)
        ? field
        : `custom:${header}`;
  }
  return mapping;
}
export async function proposeMapping(
  headers: string[],
  rows: Record<string, string>[],
  llm?: LLMProvider,
) {
  try {
    const result = await structured(
      z.object({ mapping: mappingSchema }),
      "Map spreadsheet columns to email, name, company, role, website, notes, ignore or custom:<column>. Return {mapping:{originalHeader:field}}.",
      JSON.stringify({ headers, rows: rows.slice(0, 5) }),
      llm,
    );
    return validateMapping(headers, result.value.mapping);
  } catch {
    return heuristicMapping(headers);
  }
}
export function validateMapping(headers: string[], value: unknown) {
  const parsed = mappingSchema.parse(value);
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const target = parsed[h] ?? "ignore";
    if (
      !/^(email|name|company|role|website|notes|ignore|custom:[a-zA-Z0-9_ -]{1,100})$/.test(
        target,
      )
    )
      throw new Error("Invalid mapping target");
    if (target !== "ignore" && used.has(target))
      throw new Error(`Map ${target} only once per sheet`);
    used.add(target);
    result[h] = target;
  }
  return result;
}
export function mapRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
) {
  const cleaned: Record<string, string> = {};
  for (const [h, target] of Object.entries(mapping))
    if (target !== "ignore")
      cleaned[target.replace(/^custom:/, "")] = row[h] ?? "";
  return cleaned;
}
