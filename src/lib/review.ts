import { and, eq, sql, inArray } from "drizzle-orm";
import { database } from "../db";
import { campaigns, drafts, templateVersions, workerState } from "../db/schema";
import { currentVersion } from "./generation";
import { config } from "./settings";
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
