import { parentPort } from "node:worker_threads";
import { decodeImage, thumbnailPng } from "./decode-image.js";
import type { PixelRequest, PixelResponse } from "./service.js";

/** Decodes pixel data for the viewer and thumbnails off the main thread (GEN-238). */
const port = parentPort;
if (!port) throw new Error("pixel-worker must run as a worker thread");
port.on("message", (req: PixelRequest) => {
  const reply = (r: PixelResponse, transfer: ArrayBuffer[] = []) => port.postMessage(r, transfer);
  const work =
    req.op === "image"
      ? decodeImage(req.path, req.frame).then((result) => reply({ id: req.id, image: result }, result.status === "ok" ? [result.values.buffer] : []))
      : thumbnailPng(req.path).then((png) => reply({ id: req.id, png: png ? new Uint8Array(png) : null }));
  work.catch((err: unknown) => reply({ id: req.id, error: err instanceof Error ? err.message : String(err) }));
});
