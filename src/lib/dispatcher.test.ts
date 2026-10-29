import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../db";
import { createCampaign } from "../db/repository";
import { ingest } from "./ingestion";
import {
  drafts,
  templateVersions,
  leads,
  sendLog,
  contacts,
  dailyCounters,
} from "../db/schema";
import { queueCampaign } from "./review";
import { reserve, complete, reconcile, setState,dispatchStep,state } from "./dispatcher";
import { settingsSchema } from "./settings";
function fixture(dryRun = false) {
  const c = openDatabase(":memory:");
  const campaign = createCampaign({ name: "Send" }, c);
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
          { email: "c@example.com", name: "Grace" },
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
      sample: "",
      analysis: "{}",
      approved: true,
      testedAt: 1,
      createdAt: 1,
    })
    .run();
  c.db.transaction((tx) =>
    c.db
      .select()
      .from(leads)
      .all()
      .forEach((lead) =>
        tx
          .insert(drafts)
          .values({
            id: randomUUID(),
            campaignId: campaign.id,
            leadId: lead.id,
            versionId: "v",
            subject: "Hi",
            body: "Hello",
            status: "approved",
            idempotencyKey: randomUUID(),
          })
          .run(),
      ),
  );
  queueCampaign(campaign.id, c, dryRun);
  return c;
}
test("quota includes in-flight reservations and restarts send only remaining daily capacity", () => {
  const c = fixture();
  const cfg = settingsSchema.parse({
    dailyCap: 2,
    warmup: false,
    dryRun: false,
    timezone: "UTC",
  });
  const now = new Date("2026-10-30T11:00:00Z");
  try {
    const first = reserve(cfg, now, c)!;
    expect(first).not.toBeNull();
    expect(reserve(cfg, now, c)).toBeNull();
    complete(first, { messageId: "m1", threadId: "t1" }, now, c);
    complete(first, { messageId: "m1", threadId: "t1" }, now, c);
    const second = reserve(cfg, now, c)!;
    complete(second, { messageId: "m2", threadId: "t2" }, now, c);
    expect(reserve(cfg, now, c)).toBeNull();
    expect(c.db.select().from(dailyCounters).get()?.sentCount).toBe(2);
    expect(reserve(cfg, new Date("2026-10-31T11:00:00Z"), c)).toBeNull();
  } finally {
    c.sqlite.close();
  }
});
test("crash after an ambiguous send never resends and Sent reconciliation completes once", async () => {
  const c = fixture();
  const cfg = settingsSchema.parse({
    dryRun: false,
    warmup: false,
    timezone: "UTC",
  });
  const now = new Date("2026-10-30T11:00:00Z");
  try {
    const first = reserve(cfg, now, c)!;
    await reconcile(c, async () => null);
    expect(c.db.select().from(sendLog).get()?.status).toBe("uncertain");
    expect(
      c.db
        .select()
        .from(drafts)
        .all()
        .find((d) => d.id === first.draft.id)?.status,
    ).toBe("uncertain");
    await reconcile(c, async () => ({ id: "m", threadId: "t" }));
    await reconcile(c, async () => ({ id: "m", threadId: "t" }));
    expect(c.db.select().from(dailyCounters).get()?.sentCount).toBe(1);
    expect(
      c.db
        .select()
        .from(contacts)
        .all()
        .filter((v) => v.status === "sent"),
    ).toHaveLength(1);
  } finally {
    c.sqlite.close();
  }
});
test("dry-run does not consume real contact history or real daily quota", () => {
  const c = fixture(true);
  const cfg = settingsSchema.parse({
    dryRun: true,
    warmup: false,
    timezone: "UTC",
  });
  const now = new Date("2026-10-30T11:00:00Z");
  try {
    const r = reserve(cfg, now, c)!;
    complete(r, { messageId: "dry", threadId: "dry" }, now, c, 60000);
    expect(reserve(cfg, now, c)).toBeNull();
    expect(
      c.db
        .select()
        .from(contacts)
        .all()
        .every((v) => v.status === "pending"),
    ).toBe(true);
    expect(c.db.select().from(dailyCounters).get()?.localDate).toBe(
      "dry:2026-10-30",
    );
    setState("nextSendAt", "0", c);
  } finally {
    c.sqlite.close();
  }
});
test("dispatcher becomes idle after approved queue is exhausted",async()=>{const c=fixture(true);const cfg=settingsSchema.parse({dryRun:true,warmup:false,timezone:"UTC",footer:""});try{for(let i=0;i<3;i++)expect(await dispatchStep(c,cfg,new Date(Date.parse("2026-10-30T11:00:00Z")+i*181000),async()=>{throw new Error("Never call real transport in dry run");},async()=>true,"")).toBe(true);await dispatchStep(c,cfg,new Date("2026-10-30T11:15:00Z"),undefined,undefined,"");expect(state("status",c)).toContain("Idle");expect(c.db.select().from(sendLog).all().every(l=>l.status==="dry_run")).toBe(true);}finally{c.sqlite.close();}});
