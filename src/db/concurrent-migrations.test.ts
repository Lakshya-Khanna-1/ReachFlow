import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("web and worker may initialize a fresh database concurrently", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-migrate-"));
  try {
    const code =
      "const c=require('./src/db/index.ts').openDatabase(process.argv[1]);c.sqlite.close();";
    const results = await Promise.all(
      [1, 2].map(() =>
        promisify(execFile)(process.execPath, [
          "--import",
          "tsx",
          "-e",
          code,
          join(dir, "db"),
        ]),
      ),
    );
    expect(results).toHaveLength(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
