import { test, expect } from "vitest";
import { classifyReply, recordReply, alertOnce } from "./replies";
import { openDatabase } from "../db";
import { createCampaign } from "../db/repository";
import { ingest } from "./ingestion";
import {
  templateVersions,
  drafts,
  leads,
  sendLog,
  contacts,
  suppression,
  replyEvents,
} from "../db/schema";
test("reply fixtures distinguish bounce, auto-reply, unsubscribe and quoted opt-out", () => {
  expect(
    classifyReply("Mailer-Daemon@example.com", "Delivery failure", "Failed"),
  ).toBe("bounce");
  expect(classifyReply("a@example.com", "Out of office", "Back Monday")).toBe(
    "auto_reply",
  );
  expect(
    classifyReply(
      "a@example.com",
      "Re: Hello",
      "Please remove me from this list.",
    ),
  ).toBe("unsubscribe");
  expect(
    classifyReply(
      "a@example.com",
      "Re: Hello",
      "Sounds interesting.\n\nOn Monday you wrote:\n> Reply unsubscribe to opt out.",
    ),
  ).toBe("reply");
});
test("reply events and alerts are idempotent; bounce auto-suppresses", async () => {
  const c = openDatabase(":memory:");
  try {
    const campaign = createCampaign({ name: "Replies" }, c);
    ingest(
      campaign.id,
      [
        {
          name: "Test",
          headers: ["email", "name"],
          originalHeaders: ["email", "name"],
          blankRows: 0,
          rows: [{ email: "a@example.com", name: "Ada" }],
        },
      ],
      c,
    );
    const lead = c.db.select().from(leads).get()!;
    c.db
      .insert(templateVersions)
      .values({
        id: "v",
        campaignId: campaign.id,
        analysis: "{}",
        sample: "",
        createdAt: 1,
      })
      .run();
    c.db
      .insert(drafts)
      .values({
        id: "d",
        campaignId: campaign.id,
        versionId: "v",
        leadId: lead.id,
        subject: "Hi",
        body: "Hi",
        idempotencyKey: "key",
      })
      .run();
    const log = c.db
      .insert(sendLog)
      .values({
        id: "s",
        draftId: "d",
        contactId: lead.contactId!,
        startedAt: 1,
        localDate: "2026-10-30",
        status: "sent",
        messageId: "m",
        threadId: "t",
      })
      .returning()
      .get();
    const event = recordReply(log, "reply-1", "reply", "Yes", c);
    recordReply(log, "reply-1", "reply", "Yes", c);
    let sent = 0;
    await alertOnce(
      event.id,
      "friend@example.com",
      async () => {
        sent++;
      },
      c,
      async () => null,
    );
    await alertOnce(
      event.id,
      "friend@example.com",
      async () => {
        sent++;
      },
      c,
      async () => null,
    );
    expect(sent).toBe(1);
    expect(c.db.select().from(replyEvents).all()).toHaveLength(1);
    expect(c.db.select().from(contacts).get()?.status).toBe("replied");
    recordReply(log, "bounce-1", "bounce", "Delivery failed", c);
    expect(c.db.select().from(suppression).get()?.email).toBe("a@example.com");
    expect(c.db.select().from(contacts).get()?.status).toBe("bounced");
  } finally {
    c.sqlite.close();
  }
});
