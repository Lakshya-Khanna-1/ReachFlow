import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { expect, test } from "vitest";

test("launcher refuses an occupied port instead of changing the OAuth port", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port");
    const result = await new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/launch.mjs"], {
          env: { ...process.env, PORT: String(address.port) },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          output += String(chunk);
        });
        child.on("error", reject);
        child.on("exit", (code) => resolve({ code, output }));
      },
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(`Port ${address.port} is busy`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 20000);
