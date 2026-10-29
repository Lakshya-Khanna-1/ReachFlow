import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19))
  throw new Error("Install Node.js LTS (>=20.19): https://nodejs.org/");
function npm(args) {
  const result = spawnSync(
    windows ? "cmd.exe" : "npm",
    windows ? ["/d", "/c", "npm", ...args] : args,
    {
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  return result.status === 0;
}
function fingerprint() {
  const hash = createHash("sha256");
  function walk(path) {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path).sort()) walk(join(path, entry));
    } else {
      hash.update(path);
      hash.update(readFileSync(path));
    }
  }
  for (const path of [
    "src",
    "public",
    "docs",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    ".env",
  ])
    walk(path);
  return hash.digest("hex");
}
if (!existsSync(".env")) copyFileSync(".env.example", ".env");
process.loadEnvFile(".env");
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT in .env.");
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () => {
    console.error(
      `Port ${port} is busy. Stop its owning process and retry. Keep the OAuth redirect URI consistent with PORT.`,
    );
    if (windows)
      spawnSync("netstat", ["-ano", "-p", "TCP"], { stdio: "inherit" });
    else
      spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
        stdio: "inherit",
      });
    reject(new Error("Port unavailable."));
  });
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});
const stampFile = ".reachflow-install.json";
const lockHash = () =>
  createHash("sha256")
    .update(readFileSync("package-lock.json"))
    .update(process.versions.modules)
    .digest("hex");
if (
  !existsSync("node_modules") ||
  !existsSync("package-lock.json") ||
  !existsSync(stampFile) ||
  readFileSync(stampFile, "utf8") !== lockHash()
) {
  if (!npm(["ci"]) && !npm(["install"]))
    throw new Error(
      "Dependency installation failed. See README for native build troubleshooting.",
    );
  writeFileSync(stampFile, lockHash());
}
const buildStamp = ".reachflow-build.json";
if (
  !existsSync(".next/BUILD_ID") ||
  !existsSync(buildStamp) ||
  readFileSync(buildStamp, "utf8") !== fingerprint()
) {
  if (!npm(["run", "build"])) throw new Error("Production build failed.");
  writeFileSync(buildStamp, fingerprint());
}
const child = spawn(
  process.execPath,
  ["--env-file=.env", "scripts/serve.mjs"],
  { stdio: "inherit" },
);
let exited = false;
child.on("exit", (code) => {
  exited = true;
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  exited = true;
  console.error(error.message);
  process.exitCode = 1;
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
const url = `http://localhost:${port}`;
const deadline = Date.now() + 120000;
let ready = false;
while (!exited && Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const health = await response.json();
    if (response.ok && health.app === "reachflow" && health.status === "ok") {
      ready = true;
      break;
    }
  } catch {
    /* Server may still be starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (ready) {
  const opener = windows
    ? spawn("cmd", ["/c", "start", "", url])
    : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url]);
  opener.on("error", () => console.log(`Open ${url} in your browser.`));
} else if (!exited) {
  console.error("Server did not become healthy within two minutes.");
  child.kill("SIGTERM");
  process.exitCode = 1;
}
