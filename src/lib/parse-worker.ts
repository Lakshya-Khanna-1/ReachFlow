import { parentPort, workerData } from "node:worker_threads";
import { parseWorkbook } from "./parser";
try {
  parentPort?.postMessage({
    sheets: parseWorkbook(Buffer.from(workerData.buffer), workerData.name),
  });
} catch (e) {
  parentPort?.postMessage({
    error: e instanceof Error ? e.message : "Could not parse file",
  });
}
