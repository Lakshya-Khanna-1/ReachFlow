import { test, expect } from "@playwright/test";
import { openDatabase } from "../src/db";
import { recordReply, alertOnce } from "../src/lib/replies";
import {
  sendLog,
  campaigns,
  templateVersions,
  sheets,
  leads,
  contacts,
  drafts,
} from "../src/db/schema";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
test("upload → map → analyze → test → generate → approve → dry run → reply → export", async ({
  page,
  request,
}) => {
  const origin = "http://localhost:3100";
  const settings = await (await request.get("/api/settings")).json();
  const config = {
    ...settings.config,
    baseUrl: "http://127.0.0.1:4319/v1",
    model: "test-model",
    timezone: "UTC",
    weekends: true,
    start: "00:00",
    end: "23:59",
    warmup: false,
    dailyCap: 20,
    dryRun: true,
    senderName: "Test Sender",
  };
  expect(
    (
      await request.post("/api/settings", {
        headers: { Origin: origin },
        data: { config, secrets: { llmKey: "test-secret-never-return" } },
      })
    ).ok(),
  ).toBeTruthy();
  expect(await (await request.get("/api/settings")).text()).not.toContain(
    "test-secret-never-return",
  );
  expect(
    (
      await request.post("/api/settings", {
        headers: { Origin: "https://evil.example" },
        data: { config },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/");
  await page.getByLabel("New campaign name").fill("E2E campaign");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/campaigns\//);
  const id = page.url().split("/").pop()!;
  await page
    .getByLabel("Lead spreadsheet", { exact: true })
    .setInputFiles("fixtures/messy-leads.xlsx");
  await expect(
    page.getByRole("button", { name: "Import selected sheets" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Suggest mapping with AI" })
    .first()
    .click();
  await expect(
    page.getByText("AI suggestion ready. Review before importing."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import selected sheets" }).click();
  await expect(page.getByText(/Imported 4/)).toBeVisible();
  await page
    .getByLabel("Campaign brief: offer, audience and CTA")
    .fill(
      "Help small teams organize thoughtful outreach. Ask for a short conversation.",
    );
  await page
    .getByLabel("Sample email", { exact: true })
    .fill(
      "Hi {{name}}, I help small teams keep outreach organized. Would a short conversation be useful?",
    );
  await page
    .getByRole("button", { name: "Analyze template", exact: true })
    .click();
  await expect(page.getByLabel("Core message")).toHaveValue(
    "Organize outreach",
  );
  await page.getByRole("button", { name: "Test run (3 recipients)" }).click();
  await expect(
    page.getByText("Test run saved. Review each message below."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve tested template" }).click();
  await expect(
    page.getByRole("button", { name: "Template approved", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate all drafts" }).click();
  await expect
    .poll(
      async () => {
        const v = await (
          await request.get(`/api/generation?campaignId=${id}`)
        ).json();
        return v.job?.status;
      },
      { timeout: 60000 },
    )
    .toBe("complete");
  await page
    .getByRole("checkbox", { name: /Select .+@/ })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Approve selected", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const v = await (
          await request.get(`/api/review?campaignId=${id}&status=all`)
        ).json();
        return v.counts.approved ?? 0;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Approve for sending", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm dry run", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const v = await (await request.get("/api/results")).json();
        return v.dryRun;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  const c = openDatabase(process.env.DATABASE_PATH!);
  try {
    const log = c.db.select().from(sendLog).get()!;
    const event = recordReply(
      log,
      "simulated-reply",
      "reply",
      "Yes, send me an overview.",
      c,
    );
    let alerts = 0;
    await alertOnce(
      event.id,
      "friend@example.com",
      async () => {
        alerts++;
      },
      c,
      async () => null,
    );
    await alertOnce(
      event.id,
      "friend@example.com",
      async () => {
        alerts++;
      },
      c,
      async () => null,
    );
    expect(alerts).toBe(1);
  } finally {
    c.sqlite.close();
  }
  await page.getByRole("link", { name: "Replies", exact: true }).click();
  await page.getByRole("button", { name: /reply/ }).first().click();
  await expect(
    page
      .getByRole("article")
      .getByText("Yes, send me an overview.", { exact: true }),
  ).toBeVisible();
  const exported = await request.get("/api/results?mode=export&format=xlsx");
  expect(exported.ok()).toBeTruthy();
  const book = XLSX.read(await exported.body(), { type: "buffer" });
  expect(
    XLSX.utils.sheet_to_json(book.Sheets.Results).length,
  ).toBeGreaterThanOrEqual(4);
  const response = await request.post("/api/settings", {
    headers: { Origin: origin, "Content-Type": "application/json" },
    data: '{"llmKey":"secret-fragment"',
  });
  expect(await response.text()).not.toContain("secret-fragment");
});
test("5,000 drafts keep a bounded virtual DOM and approval modal supports Escape", async ({
  page,
}) => {
  const c = openDatabase(process.env.DATABASE_PATH!);
  const id = randomUUID();
  const version = randomUUID();
  const sheet = randomUUID();
  try {
    c.db.transaction((tx) => {
      tx.insert(campaigns)
        .values({ id, name: "Large review", createdAt: Date.now() })
        .run();
      tx.insert(templateVersions)
        .values({
          id: version,
          campaignId: id,
          sample: "Sample",
          analysis: JSON.stringify({
            core_message: "Review",
            cta: "Talk",
            fixed_phrases: [],
            variable_slots: [],
          }),
          approved: true,
          testedAt: 1,
          createdAt: 1,
        })
        .run();
      tx.insert(sheets)
        .values({
          id: sheet,
          campaignId: id,
          name: "Grid",
          headers: ["email"],
          rowCount: 5000,
        })
        .run();
      for (let i = 0; i < 5000; i++) {
        const contact = randomUUID(),
          lead = randomUUID();
        tx.insert(contacts)
          .values({ id: contact, email: `grid${i}@example.org` })
          .run();
        tx.insert(leads)
          .values({
            id: lead,
            campaignId: id,
            sheetId: sheet,
            contactId: contact,
            raw: { email: `grid${i}@example.org` },
            cleaned: { email: `grid${i}@example.org` },
            segment: "Grid",
          })
          .run();
        tx.insert(drafts)
          .values({
            id: randomUUID(),
            campaignId: id,
            versionId: version,
            leadId: lead,
            subject: `Grid draft ${i}`,
            body: "Review text",
            status: "approved",
            idempotencyKey: randomUUID(),
          })
          .run();
      }
    });
  } finally {
    c.sqlite.close();
  }
  await page.goto(`/campaigns/${id}`);
  await page.getByLabel("Draft status filter").selectOption("all");
  await expect(page.getByText("approved: 5000", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.getByRole("checkbox", { name: /Select grid/ }).count())
    .toBeGreaterThan(0);
  expect(
    await page.getByRole("checkbox", { name: /Select grid/ }).count(),
  ).toBeLessThan(40);
  await page
    .getByRole("button", { name: "Approve for sending", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
