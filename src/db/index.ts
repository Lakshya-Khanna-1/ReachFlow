import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "./schema";

export function openDatabase(
  path = process.env.DATABASE_PATH ?? "./data/reachflow.db",
) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  try {
    // Lock before reading migration history: web and worker may start together.
    sqlite
      .transaction(() => {
        sqlite.exec(
          "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)",
        );
        const last =
          sqlite
            .prepare<[], { created_at: number }>(
              "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
            )
            .get()?.created_at ?? 0;
        for (const migration of readMigrationFiles({
          migrationsFolder: "./drizzle",
        }))
          if (migration.folderMillis > last) {
            for (const statement of migration.sql) sqlite.exec(statement);
            sqlite
              .prepare(
                "INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)",
              )
              .run(migration.hash, migration.folderMillis);
          }
      })
      .immediate();
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return { db, sqlite };
}

let connection: ReturnType<typeof openDatabase> | undefined;
export function database() {
  return (connection ??= openDatabase());
}
