import { database } from "../src/db/index";
import { generationStep } from "../src/lib/generation";
import {
  dispatchStep,
  reconcile,
  state,
  setState,
} from "../src/lib/dispatcher";
import { workerState } from "../src/db/schema";
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });
process.on("message", (message) => {
  if (message === "shutdown") stopping = true;
});
process.on("disconnect", () => {
  stopping = true;
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const c = database();
  c.db.transaction((tx) => {
    const owner = Number(state("workerPid", c));
    if (owner && owner !== process.pid) {
      let alive = false;
      try {
        process.kill(owner, 0);
        alive = true;
      } catch {}
      if (alive)
        throw new Error("Another ReachFlow worker already owns this database");
    }
    tx.insert(workerState)
      .values({ key: "workerPid", value: String(process.pid) })
      .onConflictDoUpdate({
        target: workerState.key,
        set: { value: String(process.pid) },
      })
      .run();
  });
  const heartbeat = setInterval(
    () => setState("heartbeat", String(Date.now()), c),
    3000,
  );
  async function loop(work: () => Promise<unknown>, delay: number) {
    while (!stopping) {
      try {
        await work();
      } catch (e) {
        setState(
          "lastError",
          e instanceof Error ? e.message : "Worker operation failed",
          c,
        );
      }
      await sleep(delay);
    }
  }
  try {
    console.log(
      "Worker ready. Saved jobs and delivery reconciliation resume automatically.",
    );
    try {
      await reconcile(c);
    } catch (e) {
      setState(
        "lastError",
        e instanceof Error ? e.message : "Reconciliation failed",
        c,
      );
    }
    await Promise.all([
      loop(() => generationStep(c), 500),
      loop(() => dispatchStep(c), 1000),
    ]);
  } finally {
    clearInterval(heartbeat);
    setState("workerPid", "", c);
    setState("heartbeat", "0", c);
    c.sqlite.close();
  }
}
void run().catch(() => {
  console.error(
    "Worker could not start. Check database access and other running ReachFlow instances.",
  );
  process.exitCode = 1;
});
