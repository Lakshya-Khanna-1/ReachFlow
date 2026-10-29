import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const folder = mkdtempSync(join(tmpdir(), "reachflow-e2e-"));
const env = {
  ...process.env,
  PORT: "3100",
  DATABASE_PATH: join(folder, "reachflow.db"),
  MOCK_PORT: "4319",
};
const children = [];
function start(args) {
  const c = spawn(process.execPath, args, { env, stdio: "inherit" });
  children.push(c);
  return c;
}
async function healthy(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Test server did not start: ${url}`);
}
try {
  start(["scripts/mock-llm.mjs"]);
  await healthy("http://127.0.0.1:4319/v1/models");
  start(["scripts/serve.mjs"]);
  await healthy("http://127.0.0.1:3100/api/health");
  const test = start(["node_modules/@playwright/test/cli.js", "test"]);
  const code = await new Promise((r) => test.once("exit", r));
  process.exitCode = code ?? 1;
} finally {
  for (const child of children.reverse())
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((r) => {
        child.once("exit", r);
        setTimeout(r, 3000);
      });
    }
  await new Promise((r) => setTimeout(r, 1500));
  try {
    rmSync(folder, { recursive: true, force: true });
  } catch {
    console.log("Test data cleanup deferred:", folder);
  }
}
