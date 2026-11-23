import { Worker } from "node:worker_threads";
import type { DecodedImage } from "./decode-image.js";

type PixelRequestBody = { op: "image"; path: string; frame: number } | { op: "thumbnail"; path: string };
export type PixelRequest = PixelRequestBody & { id: number };
export type PixelResponse = { id: number; image: DecodedImage } | { id: number; png: Uint8Array | null } | { id: number; error: string };

type Pending = { resolve: (r: PixelResponse) => void; reject: (e: Error) => void };

/**
 * One worker thread that decodes stored images (GEN-238): viewer frames and thumbnails. A worker
 * that dies fails its pending requests and is started again on the next request.
 */
export class PixelService {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly workerFile: string) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(this.workerFile);
    w.on("message", (r: PixelResponse) => {
      const p = this.pending.get(r.id);
      this.pending.delete(r.id);
      p?.resolve(r);
    });
    const fail = (e: Error) => {
      if (this.worker === w) this.worker = null;
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    };
    w.on("error", fail);
    w.on("exit", (code) => fail(new Error(`pixel worker stopped (exit ${code})`)));
    this.worker = w;
    return w;
  }

  private request(req: PixelRequestBody): Promise<PixelResponse> {
    const id = this.nextId++;
    return new Promise<PixelResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ensure().postMessage({ ...req, id });
    }).then((r) => {
      if ("error" in r) throw new Error(r.error);
      return r;
    });
  }

  async image(path: string, frame: number): Promise<DecodedImage> {
    const r = await this.request({ op: "image", path, frame });
    if (!("image" in r)) throw new Error("pixel worker: unexpected reply");
    return r.image;
  }

  async thumbnail(path: string): Promise<Buffer | null> {
    const r = await this.request({ op: "thumbnail", path });
    if (!("png" in r)) throw new Error("pixel worker: unexpected reply");
    return r.png ? Buffer.from(r.png) : null;
  }

  async stop(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    await w?.terminate();
  }
}
