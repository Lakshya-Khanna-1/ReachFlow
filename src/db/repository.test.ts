import { test, expect } from "vitest";
import { openDatabase } from "./index";
import { createCampaign, ensureContact, suppress } from "./repository";
import { contacts } from "./schema";
test("fresh migrations, normalized unique contacts and atomic suppression", () => {
  const c = openDatabase(":memory:");
  try {
    expect(createCampaign({ name: "Test" }, c).status).toBe("draft");
    const first = ensureContact(" Person@Example.com ", c);
    expect(ensureContact("person@example.com", c).id).toBe(first.id);
    expect(() =>
      c.db.insert(contacts).values({ id: "other", email: first.email }).run(),
    ).toThrow();
    suppress(first.email, "requested", c);
    expect(ensureContact(first.email, c).status).toBe("suppressed");
    expect(() => ensureContact("bad", c)).toThrow();
  } finally {
    c.sqlite.close();
  }
});
