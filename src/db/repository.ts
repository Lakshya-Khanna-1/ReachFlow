import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { database } from "./index";
import { campaigns, contacts, suppression } from "./schema";
import { campaignSchema, emailSchema } from "../lib/contracts";
export function createCampaign(input: unknown, connection = database()) {
  const data = campaignSchema.parse(input);
  return connection.db.transaction((tx) =>
    tx
      .insert(campaigns)
      .values({ ...data, id: randomUUID(), createdAt: Date.now() })
      .returning()
      .get(),
  );
}
export function ensureContact(input: unknown, connection = database()) {
  const email = emailSchema.parse(input);
  return connection.db.transaction((tx) => {
    tx.insert(contacts)
      .values({ id: randomUUID(), email })
      .onConflictDoNothing()
      .run();
    return tx.select().from(contacts).where(eq(contacts.email, email)).get()!;
  });
}
export function suppress(
  input: unknown,
  reason: string,
  connection = database(),
) {
  const email = emailSchema.parse(input);
  connection.db.transaction((tx) => {
    tx.insert(suppression)
      .values({ email, reason: reason.slice(0, 500), createdAt: Date.now() })
      .onConflictDoNothing()
      .run();
    tx.update(contacts)
      .set({ status: "suppressed" })
      .where(eq(contacts.email, email))
      .run();
  });
}
