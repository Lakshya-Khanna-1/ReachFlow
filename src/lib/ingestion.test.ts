import { test, expect } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { parseWorkbook } from "./parser";
import { ingest } from "./ingestion";
import { openDatabase } from "../db";
import { createCampaign, ensureContact } from "../db/repository";
test("messy multi-sheet files remove invalid duplicates blanks and global contacts", () => {
  const c = openDatabase(":memory:");
  try {
    const campaign = createCampaign({ name: "Fixture" }, c);
    ensureContact("known@example.com", c);
    const book = XLSX.read(readFileSync("fixtures/messy-leads.xlsx"), {
      type: "buffer",
    });
    const parsed = parseWorkbook(
      XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
      "fixture.xlsx",
    );
    expect(parsed).toHaveLength(3);
    const report = ingest(campaign.id, parsed, c);
    expect(report.imported).toBe(3);
    expect(report.invalid).toBe(1);
    expect(report.duplicates).toBe(1);
    expect(report.alreadyContacted).toBe(1);
    expect(report.blankRows).toBeGreaterThanOrEqual(1);
  } finally {
    c.sqlite.close();
  }
});
test("50,000 data rows parse without truncation", () => {
  const lines = [
    "email,name",
    ...Array.from(
      { length: 50000 },
      (_, i) => `person${i}@example.com,Person ${i}`,
    ),
  ];
  const parsed = parseWorkbook(Buffer.from(lines.join("\n")), "large.csv");
  expect(parsed[0].rows).toHaveLength(50000);
  expect(parsed[0].rows[49999].email).toBe("person49999@example.com");
}, 20000);
test("JSON mixed primitives and odd headers are preserved as strings", () => {
  const parsed = parseWorkbook(
    Buffer.from('[{" E-mail ":"a@example.com","Count":12,"Active":true}]'),
    "data.json",
  );
  expect(parsed[0].rows[0]).toMatchObject({
    e_mail: "a@example.com",
    count: "12",
    active: "TRUE",
  });
  expect(() => parseWorkbook(Buffer.from("[]"), "bad.exe")).toThrow();
});
