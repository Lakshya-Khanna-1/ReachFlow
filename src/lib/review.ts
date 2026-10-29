import { and, eq, sql, inArray } from "drizzle-orm";
import { database } from "../db";
import { campaigns, drafts, templateVersions, workerState } from "../db/schema";
import { currentVersion } from "./generation";
import { config } from "./settings";
export function updateReviewRows(
  campaignId: string,
  versionId: string,
  ids: string[],
  values: Partial<typeof drafts.$inferInsert>,
  expectedBody?: string,
) {
  const c = database();
  return c.db.transaction((tx) => {
    const version = currentVersion(campaignId, c);
    if (version.id !== versionId)
      throw new Error("Template changed. Reload before editing drafts");
    if (values.status === "approved" && !version.approved)
      throw new Error("Approve the template first");
    const rows = tx
      .select()
      .from(drafts)
      .where(
        and(
          inArray(drafts.id, ids),
          eq(drafts.versionId, versionId),
          eq(drafts.isTest, false),
        ),
      )
      .all();
    if (
      rows.length !== ids.length ||
      rows.some(
        (d) =>
          ["sending", "sent", "uncertain"].includes(d.status) ||
          (expectedBody !== undefined && d.body !== expectedBody),
      )
    )
      throw new Error("Draft changed or is sending. Reload before editing");
    tx.update(drafts).set(values).where(inArray(drafts.id, ids)).run();
  });
}
export function approveTemplate(campaignId: string, connection = database()) {
  const v = currentVersion(campaignId, connection);
  if (!v.testedAt)
    throw new Error("Complete the test run before approving the template");
  connection.db.transaction((tx) => {
    tx.update(templateVersions)
      .set({ approved: true })
      .where(eq(templateVersions.id, v.id))
      .run();
    tx.update(drafts)
      .set({ status: "approved" })
      .where(
        and(
          eq(drafts.versionId, v.id),
          eq(drafts.isTest, false),
          eq(drafts.edited, false),
          inArray(drafts.status, ["pending", "attention"]),
          sql`${drafts.flags} = '[]'`,
        ),
      )
      .run();
  });
}
export function queueCampaign(
  campaignId: string,
  connection = database(),
  dryRun = config().dryRun,
) {
  const v = currentVersion(campaignId, connection);
  if (!v.approved) throw new Error("Approve the tested template first");
  return connection.db.transaction((tx) => {
    const count = tx
      .select({ n: sql<number>`count(*)` })
      .from(drafts)
      .where(
        and(
          eq(drafts.versionId, v.id),
          eq(drafts.isTest, false),
          eq(drafts.status, "approved"),
        ),
      )
      .get()!.n;
    if (!count) throw new Error("No approved drafts to send");
    tx.update(campaigns)
      .set({ status: "queued" })
      .where(eq(campaigns.id, campaignId))
      .run();
    tx.insert(workerState)
      .values({
        key: `campaignMode:${campaignId}`,
        value: JSON.stringify({ dryRun, versionId: v.id }),
      })
      .onConflictDoUpdate({
        target: workerState.key,
        set: { value: JSON.stringify({ dryRun, versionId: v.id }) },
      })
      .run();
    return count;
  });
}
