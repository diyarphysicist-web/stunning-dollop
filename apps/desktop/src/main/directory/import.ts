import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ImportProgress } from "@neuromr/contracts";
import { readDicomdir, readHeader, type InstanceHeader } from "@neuromr/dicom";
import type { StudyIndex } from "./study-index.js";

export interface ImportOptions {
  index: StudyIndex;
  importId: number;
  source: "folder" | "dicomdir";
  /** The chosen folder, or the DICOMDIR file. */
  root: string;
  storeRoot: string;
  signal: AbortSignal;
  onProgress: (p: ImportProgress) => void;
  /** Minimum time between progress reports and interim series refreshes. */
  flushMs?: number;
}

const PLAIN_UID = /^[0-9]+(\.[0-9]+)*$/;

/** A path component for a UID; anything that is not a plain UID is hashed so file contents never shape paths (DIR-007). */
export function uidComponent(uid: string): string {
  return PLAIN_UID.test(uid) && uid.length <= 64 ? uid : createHash("sha256").update(uid).digest("hex").slice(0, 40);
}

export function storePath(storeRoot: string, h: InstanceHeader): string {
  return join(storeRoot, uidComponent(h.studyInstanceUid), uidComponent(h.seriesInstanceUid), `${uidComponent(h.sopInstanceUid)}.dcm`);
}

/** All files below `root`, depth first, in name order; stops early when cancelled. */
async function walk(root: string, signal: AbortSignal): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0 && !signal.aborted) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // An unreadable sub-folder does not stop the import.
    }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out.sort();
}

/** Referenced files of a DICOMDIR, resolved inside its folder; references that escape the folder are ignored. */
async function dicomdirFiles(file: string): Promise<string[] | undefined> {
  const entries = readDicomdir(await readFile(file));
  if (!entries) return undefined;
  const base = resolve(dirname(file));
  return entries.map((parts) => resolve(base, ...parts)).filter((p) => p.startsWith(base + sep));
}

/**
 * Imports one folder or DICOMDIR into the local store and index (DIR-001, DIR-006…008).
 * Never throws for a bad input file; only a store failure (for example a full disk) fails the import.
 */
export async function runImport(o: ImportOptions): Promise<ImportProgress> {
  const flushMs = o.flushMs ?? 500;
  const p: ImportProgress = { importId: o.importId, source: o.source, phase: "scanning", found: 0, read: 0, imported: 0, duplicates: 0, notDicom: 0, quarantined: 0, indexVersion: o.index.indexVersion() };
  const report = () => {
    o.index.updateImport(p);
    o.onProgress({ ...p });
  };
  const touched = new Set<string>();
  const dirty = new Set<string>();
  let lastFlush = Date.now();
  const flush = (force: boolean) => {
    if (!force && Date.now() - lastFlush < flushMs) return;
    lastFlush = Date.now();
    for (const uid of dirty) o.index.refreshSeries(uid, false);
    if (dirty.size > 0) p.indexVersion = o.index.bumpIndexVersion();
    dirty.clear();
    report();
  };

  try {
    report();
    let files: string[];
    if (o.source === "dicomdir") {
      const listed = await dicomdirFiles(o.root);
      if (!listed) {
        o.index.addQuarantine(o.importId, o.root, "unreadable", "not a readable DICOMDIR");
        p.quarantined = 1;
        p.phase = "done";
        report();
        return p;
      }
      files = listed;
    } else {
      files = await walk(o.root, o.signal);
    }
    p.found = files.length;
    p.phase = "reading";
    report();

    for (const file of files) {
      if (o.signal.aborted) break;
      let bytes: Uint8Array;
      try {
        bytes = await readFile(file);
      } catch (err) {
        const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
        o.index.addQuarantine(o.importId, file, missing ? "missing-file" : "unreadable", missing ? "file listed in the DICOMDIR is missing" : (err as Error).message);
        p.quarantined++;
        p.read++;
        continue;
      }
      p.read++;
      const r = readHeader(bytes);
      if (r.status === "skip") {
        p.found--; // The DICOMDIR itself is an index, not an image.
        p.read--;
      } else if (r.status === "quarantine") {
        if (r.reason === "not-dicom") p.notDicom++;
        else {
          o.index.addQuarantine(o.importId, file, r.reason, r.detail);
          p.quarantined++;
        }
      } else if (o.index.hasInstance(r.header.sopInstanceUid)) {
        p.duplicates++;
      } else {
        const dest = storePath(o.storeRoot, r.header);
        const tmp = `${dest}.part`;
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(file, tmp);
        await rename(tmp, dest);
        try {
          o.index.addInstance(r.header, dest, bytes.length);
        } catch (err) {
          await rm(dest, { force: true });
          throw err;
        }
        p.imported++;
        touched.add(r.header.seriesInstanceUid);
        dirty.add(r.header.seriesInstanceUid);
      }
      flush(false);
    }

    p.phase = "finishing";
    flush(true);
    for (const uid of touched) o.index.refreshSeries(uid, true);
    if (touched.size > 0) p.indexVersion = o.index.bumpIndexVersion();
    p.phase = o.signal.aborted ? "cancelled" : "done";
    report();
    return p;
  } catch (err) {
    // Series already stored stay usable (DIR-008); the import itself is reported as failed.
    for (const uid of touched) {
      try {
        o.index.refreshSeries(uid, true);
      } catch {
        /* the index is reported as failed below */
      }
    }
    p.phase = "failed";
    p.error = err instanceof Error ? err.message : String(err);
    p.indexVersion = o.index.bumpIndexVersion();
    report();
    return p;
  }
}
