import { database } from "../src/db/index";
import { generationStep } from "../src/lib/generation";
let stopping = false;
process.on("message", (message) => {
  if (message === "shutdown") stopping = true;
});
process.on("disconnect", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function run() {
  const connection = database();
  try {
    console.log(
      "Worker ready. Persisted generation jobs resume automatically.",
    );
    while (!stopping) {
      try {
        const worked = await generationStep(connection);
        if (!worked) await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.error(e instanceof Error ? e.message : "Worker failed");
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    connection.sqlite.close();
  }
}
void run();
