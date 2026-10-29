import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});
export const campaigns = sqliteTable("campaigns", {
  id: text().primaryKey(),
  name: text().notNull(),
  brief: text().notNull().default(""),
  sample: text().notNull().default(""),
  tone: text().notNull().default("professional"),
  minWords: integer().notNull().default(50),
  maxWords: integer().notNull().default(150),
  bannedPhrases: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  status: text({
    enum: ["draft", "generating", "review", "queued", "paused", "complete"],
  })
    .notNull()
    .default("draft"),
  createdAt: integer().notNull(),
});
export const sheets = sqliteTable("sheets", {
  id: text().primaryKey(),
  campaignId: text()
    .notNull()
    .references(() => campaigns.id),
  name: text().notNull(),
  headers: text({ mode: "json" }).$type<string[]>().notNull(),
  rowCount: integer().notNull(),
});
export const columnMappings = sqliteTable("column_mappings", {
  sheetId: text()
    .primaryKey()
    .references(() => sheets.id),
  mapping: text({ mode: "json" }).$type<Record<string, string>>().notNull(),
});
export const contacts = sqliteTable("contacts", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  status: text({
    enum: ["pending", "sent", "replied", "bounced", "suppressed"],
  })
    .notNull()
    .default("pending"),
  firstContactedAt: integer(),
});
export const leads = sqliteTable("leads", {
  id: text().primaryKey(),
  campaignId: text()
    .notNull()
    .references(() => campaigns.id),
  sheetId: text()
    .notNull()
    .references(() => sheets.id),
  contactId: text().references(() => contacts.id),
  raw: text({ mode: "json" }).$type<Record<string, string>>().notNull(),
  cleaned: text({ mode: "json" }).$type<Record<string, string>>().notNull(),
  segment: text().notNull(),
});
export const templateAnalyses = sqliteTable("template_analyses", {
  campaignId: text()
    .primaryKey()
    .references(() => campaigns.id),
  analysis: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
});
export const templateVersions = sqliteTable("template_versions", {
  id: text().primaryKey(),
  campaignId: text()
    .notNull()
    .references(() => campaigns.id),
  analysis: text().notNull(),
  sample: text().notNull(),
  approved: integer({ mode: "boolean" }).notNull().default(false),
  testedAt: integer(),
  createdAt: integer().notNull(),
});
export const drafts = sqliteTable(
  "drafts",
  {
    id: text().primaryKey(),
    campaignId: text()
      .notNull()
      .references(() => campaigns.id),
    leadId: text()
      .notNull()
      .references(() => leads.id),
    versionId: text()
      .notNull()
      .references(() => templateVersions.id),
    subject: text().notNull(),
    body: text().notNull(),
    status: text({
      enum: [
        "pending",
        "attention",
        "approved",
        "rejected",
        "sending",
        "sent",
        "failed",
        "uncertain",
      ],
    })
      .notNull()
      .default("pending"),
    flags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    usedFields: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    confidence: real().notNull().default(0),
    notes: text().notNull().default(""),
    edited: integer({ mode: "boolean" }).notNull().default(false),
    idempotencyKey: text().notNull().unique(),
    isTest: integer({ mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("draft_lead_version_test").on(t.leadId, t.versionId, t.isTest),
  ],
);
export const sendLog = sqliteTable("send_log", {
  id: text().primaryKey(),
  draftId: text()
    .notNull()
    .unique()
    .references(() => drafts.id),
  contactId: text()
    .notNull()
    .references(() => contacts.id),
  startedAt: integer().notNull(),
  sentAt: integer(),
  localDate: text().notNull(),
  messageId: text(),
  threadId: text(),
  status: text({
    enum: ["sending", "sent", "failed", "uncertain", "dry_run"],
  }).notNull(),
  error: text(),
  dryRun: integer({ mode: "boolean" }).notNull().default(false),
});
export const dailyCounters = sqliteTable("daily_counters", {
  localDate: text().primaryKey(),
  sentCount: integer().notNull().default(0),
  capApplied: integer().notNull(),
});
export const replyEvents = sqliteTable("reply_events", {
  id: text().primaryKey(),
  messageId: text().notNull().unique(),
  sendId: text()
    .notNull()
    .references(() => sendLog.id),
  type: text({
    enum: ["reply", "bounce", "auto_reply", "unsubscribe"],
  }).notNull(),
  snippet: text().notNull(),
  createdAt: integer().notNull(),
});
export const alertsSent = sqliteTable(
  "alerts_sent",
  {
    eventId: text()
      .notNull()
      .references(() => replyEvents.id),
    recipient: text().notNull(),
    status: text({ enum: ["sending", "sent", "uncertain"] }).notNull(),
    idempotencyKey: text().notNull().unique(),
    sentAt: integer(),
  },
  (t) => [uniqueIndex("alert_event_recipient").on(t.eventId, t.recipient)],
);
export const suppression = sqliteTable("suppression", {
  email: text().primaryKey(),
  reason: text().notNull(),
  createdAt: integer().notNull(),
});
export const workerState = sqliteTable("worker_state", {
  key: text().primaryKey(),
  value: text().notNull(),
});
export const jobs = sqliteTable("jobs", {
  id: text().primaryKey(),
  campaignId: text()
    .notNull()
    .references(() => campaigns.id),
  status: text({
    enum: ["running", "paused", "cancelled", "complete", "failed"],
  }).notNull(),
  total: integer().notNull(),
  completed: integer().notNull().default(0),
  errors: integer().notNull().default(0),
  tokens: integer().notNull().default(0),
  lastError: text(),
  createdAt: integer().notNull(),
});
