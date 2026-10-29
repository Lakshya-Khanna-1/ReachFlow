import next from "next";
import http from "node:http";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const app = next({
  dev: process.argv.includes("--dev"),
  hostname: "127.0.0.1",
  port,
});
await app.prepare();
const server = http.createServer(app.getRequestHandler());
let worker;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("Stopping ReachFlow…");
  const deadline = setTimeout(() => {
    worker?.kill();
    process.exit(code || 1);
  }, 10000);
  if (worker && worker.exitCode === null) {
    await new Promise((resolve) => {
      worker.once("exit", resolve);
      worker.send("shutdown");
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await app.close();
  clearTimeout(deadline);
  process.exit(code);
}
server.on("error", (error) => {
  console.error(error.message);
  void stop(1);
});
server.listen(port, "127.0.0.1", () => {
  console.log(`ReachFlow listening at http://localhost:${port}`);
  worker = fork(fileURLToPath(new URL("./worker.ts", import.meta.url)), [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    execArgv: ["--import", "tsx"],
  });
  worker.on("exit", (code) => {
    if (!stopping) {
      console.error(`Worker exited (${code}). Stopping web server.`);
      void stop(1);
    }
  });
  worker.on("error", (error) => {
    console.error(error.message);
    void stop(1);
  });
});
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
