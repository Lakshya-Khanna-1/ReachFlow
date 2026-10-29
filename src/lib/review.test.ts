import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../db";
import { createCampaign } from "../db/repository";
import { ingest } from "./ingestion";
import { drafts, leads, templateVersions, workerState } from "../db/schema";
import { approveTemplate, queueCampaign } from "./review";
test("template approval auto-approves only clean rows and queue snapshots dry-run mode", () => {
  const c = openDatabase(":memory:");
  try {
    const campaign = createCampaign({ name: "Review" }, c);
    ingest(
      campaign.id,
      [
        {
          name: "Test",
          headers: ["email", "name"],
          originalHeaders: ["email", "name"],
          blankRows: 0,
          rows: [
            { email: "a@example.com", name: "Ada" },
            { email: "b@example.com", name: "Alan" },
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
        analysis: "{}",
        sample: "",
        createdAt: 1,
        testedAt: 1,
      })
      .run();
    const rows = c.db.select().from(leads).all();
    c.db.transaction((tx) =>
      rows.forEach((lead, i) =>
        tx
          .insert(drafts)
          .values({
            id: randomUUID(),
            leadId: lead.id,
            campaignId: campaign.id,
            versionId: "v",
            subject: "Hi",
            body: "Message",
            flags: i ? ["grounding"] : [],
            status: i ? "attention" : "pending",
            idempotencyKey: randomUUID(),
          })
          .run(),
      ),
    );
    approveTemplate(campaign.id, c);
    expect(
      c.db
        .select()
        .from(drafts)
        .all()
        .map((d) => d.status)
        .sort(),
    ).toEqual(["approved", "attention"]);
    expect(queueCampaign(campaign.id, c, true)).toBe(1);
    expect(c.db.select().from(workerState).get()?.value).toContain(
      '"dryRun":true',
    );
  } finally {
    c.sqlite.close();
  }
});
