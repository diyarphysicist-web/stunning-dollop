import { parentPort, workerData } from "node:worker_threads";
import { runImport } from "./import.js";
import { StudyIndex } from "./study-index.js";

/** What main passes to an import worker (DIR-008: imports never run on the interface thread). */
export interface ImportWorkerData {
  dbPath: string;
  storeRoot: string;
  source: "folder" | "dicomdir";
  root: string;
  importId: number;
}

const port = parentPort;
if (!port) throw new Error("import-worker must run as a worker thread");
const data = workerData as ImportWorkerData;
const ctl = new AbortController();
port.on("message", (m: unknown) => {
  if (typeof m === "object" && m !== null && (m as { cancel?: unknown }).cancel === true) ctl.abort();
});

const index = new StudyIndex(data.dbPath);
void runImport({ ...data, index, signal: ctl.signal, onProgress: (p) => port.postMessage(p) }).finally(() => {
  index.close();
  port.close();
});
