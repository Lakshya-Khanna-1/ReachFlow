import { expect, test } from "vitest";
import { openDatabase } from "./index";

test("SQLite foundation enables foreign keys and rolls back failed transactions", () => {
  const { sqlite } = openDatabase(":memory:");
  try {
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    sqlite.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
    expect(() =>
      sqlite.transaction(() => {
        sqlite.exec("INSERT INTO sample VALUES (1)");
        throw new Error("abort");
      })(),
    ).toThrow("abort");
    expect(
      sqlite.prepare("SELECT count(*) AS count FROM sample").get(),
    ).toEqual({ count: 0 });
  } finally {
    sqlite.close();
  }
});
