import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../db";
import { createCampaign } from "../db/repository";
import { templateVersions, drafts, jobs } from "../db/schema";
import { ingest } from "./ingestion";
import { startGeneration, generationStep } from "./generation";
import { MockProvider } from "./llm";
test("persisted generation resumes after connection restart without duplicating a row", async () => {
  const folder = mkdtempSync(join(tmpdir(), "rf-generation-"));
  let c = openDatabase(join(folder, "db"));
  try {
    const campaign = createCampaign(
      { name: "Resume", sample: "Hello", minWords: 10 },
      c,
    );
    ingest(
      campaign.id,
      [
        {
          name: "Sheet",
          headers: ["email", "name", "company"],
          originalHeaders: ["email", "name", "company"],
          blankRows: 0,
          rows: [
            { email: "a@example.com", name: "Ada", company: "Analytical" },
          ],
        },
      ],
      c,
    );
    c.db
      .insert(templateVersions)
      .values({
        id: "v",
        campaignId: campaign.id,
        sample: "Hello",
        analysis: JSON.stringify({
          core_message: "Offer",
          cta: "Talk",
          fixed_phrases: [],
          variable_slots: [],
        }),
        testedAt: 1,
        createdAt: 1,
      })
      .run();
    startGeneration(campaign.id, c);
    await generationStep(
      c,
      new MockProvider([
        JSON.stringify({
          subject: "Hi",
          body: "Hi Ada, I help teams organize outreach. Would you like to talk?",
          used_fields: ["name"],
          confidence: 0.9,
          notes: "",
        }),
        JSON.stringify({ claims: [], unsupported_claims: [] }),
      ]),
      "Reply unsubscribe",
    );
    c.sqlite.close();
    c = openDatabase(join(folder, "db"));
    await generationStep(c, new MockProvider([]), "Reply unsubscribe");
    expect(c.db.select().from(drafts).all()).toHaveLength(1);
    expect(c.db.select().from(jobs).get()?.status).toBe("complete");
  } finally {
    c.sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  }
}, 20000);
