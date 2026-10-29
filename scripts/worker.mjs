import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const path = process.env.DATABASE_PATH ?? "./data/reachflow.db";
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
console.log("Worker idle. Scaffold only; no sending jobs are implemented.");
function stop() {
  db.close();
  process.exit(0);
}
process.on("message", (message) => {
  if (message === "shutdown") stop();
});
process.on("disconnect", stop);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
