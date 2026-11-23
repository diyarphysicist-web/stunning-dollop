import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { ImportProgress, type DirectoryOverview, type ImportStart } from "@neuromr/contracts";
import { PixelService } from "../pixels/service.js";
import type { ImportWorkerData } from "./import-worker.js";
import { StudyIndex } from "./study-index.js";

/**
 * Owns the study index for the main process: queries for the Directory and one import at a time
 * in a worker thread (DIR-007, DIR-008). Progress is validated before it is forwarded.
 */
export class DirectoryService {
  readonly index: StudyIndex;
  /** Decodes stored images off the main thread: viewer frames and thumbnails (GEN-238). */
  readonly pixels: PixelService;
  private readonly dbPath: string;
  private readonly storeRoot: string;
  private worker: Worker | null = null;

  constructor(
    userData: string,
    private readonly workerFile: string,
    private readonly emit: (p: ImportProgress) => void,
    pixelWorkerFile: string,
  ) {
    this.dbPath = join(userData, "index.sqlite");
    this.storeRoot = join(userData, "store");
    this.index = new StudyIndex(this.dbPath);
    this.pixels = new PixelService(pixelWorkerFile);
    this.recover();
  }

  /** Finishes series a crash left importing; their thumbnails are decoded in the pixel worker. */
  private recover(): void {
    const recovered = this.index.recoverInterrupted();
    if (recovered.length === 0) return;
    void (async () => {
      for (const uid of recovered) {
        const src = this.index.thumbnailSource(uid);
        if (!src) continue;
        try {
          this.index.setThumbnail(uid, await this.pixels.thumbnail(src.path, src.frame));
        } catch {
          /* the series stays usable without a thumbnail */
        }
      }
      this.index.bumpIndexVersion();
    })();
  }

  busy(): boolean {
    return this.worker !== null;
  }

  startImport(source: "folder" | "dicomdir", root: string): ImportStart {
    if (this.worker) return { started: false, why: "busy" };
    const importId = this.index.startImport(source, root);
    const workerData: ImportWorkerData = { dbPath: this.dbPath, storeRoot: this.storeRoot, source, root, importId };
    const worker = new Worker(this.workerFile, { workerData });
    this.worker = worker;
    let last: ImportProgress | null = null;
    worker.on("message", (m: unknown) => {
      const p = ImportProgress.safeParse(m);
      if (!p.success) return;
      last = p.data;
      this.emit(p.data);
    });
    const fail = (error: string) => {
      const ended = last && (last.phase === "done" || last.phase === "cancelled" || last.phase === "failed");
      if (ended) return;
      this.recover();
      const p = this.index.lastImport();
      if (p) this.emit({ ...p, phase: "failed", error });
    };
    worker.on("error", (err: Error) => fail(err.message));
    worker.on("exit", (code) => {
      this.worker = null;
      if (code !== 0) fail(`import stopped (exit ${code})`);
    });
    return { started: true, importId };
  }

  cancelImport(): boolean {
    if (!this.worker) return false;
    this.worker.postMessage({ cancel: true });
    return true;
  }

  overview(): DirectoryOverview {
    return { ...this.index.overview(), lastImport: this.index.lastImport() };
  }

  /** On quit: a running import stops at its next file; whatever was stored stays (DIR-008). */
  async stop(): Promise<void> {
    const w = this.worker;
    if (w) {
      w.postMessage({ cancel: true });
      await Promise.race([new Promise((r) => w.once("exit", r)), new Promise((r) => setTimeout(r, 2000))]);
      await w.terminate();
    }
    await this.pixels.stop();
    this.index.close();
  }
}
