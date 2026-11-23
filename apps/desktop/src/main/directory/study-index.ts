import type { ImportPhase, ImportProgress, QuarantineEntry, QuarantineReason, SeriesRow, SeriesStatus, SeriesType, StudyRow } from "@neuromr/contracts";
import { describeSeries, expandFrames, type InstanceHeader, type SeriesFacts } from "@neuromr/dicom";
import Database from "better-sqlite3";
import { thumbnailPng } from "../pixels/decode-image.js";

const SCHEMA_VERSION = 3;

/** Schema 2: Viewer sessions (GEN-241) and bookmarks (GEN-242), one JSON state per row. */
const SESSIONS = `
CREATE TABLE sessions (study_uid TEXT PRIMARY KEY, state TEXT NOT NULL, saved_at TEXT NOT NULL);
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, study_uid TEXT NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, saved_at TEXT NOT NULL,
  UNIQUE (study_uid, name)
);
CREATE INDEX bookmarks_study ON bookmarks (study_uid);
`;

/** Schema 3: user layout presets (GEN-243), one per name, for the whole profile. */
const PRESETS = `
CREATE TABLE layout_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, layout TEXT NOT NULL, cells TEXT NOT NULL, saved_at TEXT NOT NULL
);
`;

const SCHEMA = `
CREATE TABLE studies (
  study_uid TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL, patient_id TEXT NOT NULL, patient_birth_date TEXT NOT NULL, patient_sex TEXT NOT NULL,
  study_date TEXT NOT NULL, study_time TEXT NOT NULL, study_description TEXT NOT NULL, accession TEXT NOT NULL,
  modality TEXT NOT NULL, field_strength REAL
);
CREATE TABLE series (
  series_uid TEXT PRIMARY KEY,
  study_uid TEXT NOT NULL REFERENCES studies(study_uid),
  series_number INTEGER, description TEXT NOT NULL, modality TEXT NOT NULL,
  status TEXT NOT NULL, types TEXT NOT NULL, facts TEXT, image_count INTEGER NOT NULL DEFAULT 0, thumbnail BLOB
);
CREATE INDEX series_study ON series(study_uid);
CREATE TABLE instances (
  sop_uid TEXT PRIMARY KEY,
  series_uid TEXT NOT NULL REFERENCES series(series_uid),
  path TEXT NOT NULL, size INTEGER NOT NULL, header TEXT NOT NULL, imported_at TEXT NOT NULL
);
CREATE INDEX instances_series ON instances(series_uid);
CREATE TABLE imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, root TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  phase TEXT NOT NULL, found INTEGER NOT NULL DEFAULT 0, read INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0, duplicates INTEGER NOT NULL DEFAULT 0, not_dicom INTEGER NOT NULL DEFAULT 0,
  quarantined INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE TABLE quarantine (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES imports(id),
  path TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO meta (key, value) VALUES ('index_version', 0);
${SESSIONS}
${PRESETS}
`;

interface StudyDbRow {
  study_uid: string;
  patient_name: string;
  patient_id: string;
  patient_birth_date: string;
  patient_sex: string;
  study_date: string;
  study_description: string;
  accession: string;
  modality: string;
  field_strength: number | null;
  series_count: number;
  image_count: number | null;
}
interface SeriesDbRow {
  series_uid: string;
  study_uid: string;
  series_number: number | null;
  description: string;
  status: SeriesStatus;
  types: string;
  facts: string | null;
  image_count: number;
  thumbnail: Buffer | null;
  patient_id: string;
}
interface ImportDbRow {
  id: number;
  source: "folder" | "dicomdir";
  root: string;
  phase: ImportPhase;
  found: number;
  read: number;
  imported: number;
  duplicates: number;
  not_dicom: number;
  quarantined: number;
  error: string | null;
}

/** DICOM DA (YYYYMMDD) as ISO YYYY-MM-DD; anything else is shown as stored. */
export function isoDate(da: string): string {
  return /^\d{8}$/.test(da) ? `${da.slice(0, 4)}-${da.slice(4, 6)}-${da.slice(6, 8)}` : da;
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Instance chosen for the thumbnail: lowest b-value, first time point and echo, middle slice. */
export function thumbnailInstance(headers: readonly InstanceHeader[]): InstanceHeader | undefined {
  const key = (h: InstanceHeader) => [h.bValue ?? 0, h.temporalPosition ?? 0, h.echoNumber ?? 0, h.echoTime ?? 0];
  const first = headers.reduce<number[] | undefined>((best, h) => {
    const k = key(h);
    if (!best) return k;
    for (let i = 0; i < k.length; i++) if ((k[i] as number) !== (best[i] as number)) return (k[i] as number) < (best[i] as number) ? k : best;
    return best;
  }, undefined);
  const group = headers
    .filter((h) => key(h).every((v, i) => v === first?.[i]))
    .sort((a, b) => (a.imagePosition?.[2] ?? a.instanceNumber ?? 0) - (b.imagePosition?.[2] ?? b.instanceNumber ?? 0));
  return group[group.length >> 1];
}

/**
 * The local study index (DIR-007): studies, series, instances, imports and quarantine in SQLite.
 * One connection per thread; WAL lets the Directory read while an import writes.
 */
export class StudyIndex {
  readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    // Under WAL, NORMAL cannot corrupt the index; a power cut loses at most the last commits, which a re-import restores (DIR-007).
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version === 0) {
      this.db.transaction(() => {
        this.db.exec(SCHEMA);
        this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
      })();
    } else if (version < SCHEMA_VERSION) {
      // Migrations run in order, each in its own transaction with the version bump.
      if (version < 2)
        this.db.transaction(() => {
          this.db.exec(SESSIONS);
          this.db.pragma("user_version = 2");
        })();
      if (version < 3)
        this.db.transaction(() => {
          this.db.exec(PRESETS);
          this.db.pragma("user_version = 3");
        })();
    } else if (version > SCHEMA_VERSION) {
      throw new Error(`The study index was written by a newer version of NeuroMR-PRO (schema ${version}).`);
    }
  }

  close(): void {
    this.db.close();
  }

  indexVersion(): number {
    return (this.db.prepare("SELECT value FROM meta WHERE key = 'index_version'").get() as { value: number }).value;
  }

  bumpIndexVersion(): number {
    this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'index_version'").run();
    return this.indexVersion();
  }

  hasInstance(sopUid: string): boolean {
    return this.db.prepare("SELECT 1 FROM instances WHERE sop_uid = ?").get(sopUid) !== undefined;
  }

  private statements?: { study: Database.Statement; series: Database.Statement; instance: Database.Statement };

  /** Records stored instances in one transaction, creating study and series rows on first sight. */
  addInstances(batch: readonly { header: InstanceHeader; path: string; size: number }[]): void {
    const st = (this.statements ??= {
      study: this.db.prepare(
        `INSERT OR IGNORE INTO studies (study_uid, patient_name, patient_id, patient_birth_date, patient_sex, study_date, study_time, study_description, accession, modality, field_strength)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      series: this.db.prepare(`INSERT OR IGNORE INTO series (series_uid, study_uid, series_number, description, modality, status, types) VALUES (?, ?, ?, ?, ?, 'importing', '[]')`),
      instance: this.db.prepare("INSERT INTO instances (sop_uid, series_uid, path, size, header, imported_at) VALUES (?, ?, ?, ?, ?, ?)"),
    });
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const { header: h, path, size } of batch) {
        st.study.run(h.studyInstanceUid, h.patientName, h.patientId, h.patientBirthDate, h.patientSex, h.studyDate, h.studyTime, h.studyDescription, h.accessionNumber, h.modality, h.magneticFieldStrength ?? null);
        st.series.run(h.seriesInstanceUid, h.studyInstanceUid, h.seriesNumber ?? null, h.seriesDescription, h.modality);
        st.instance.run(h.sopInstanceUid, h.seriesInstanceUid, path, size, JSON.stringify(h), now);
      }
    })();
  }

  addInstance(header: InstanceHeader, path: string, size: number): void {
    this.addInstances([{ header, path, size }]);
  }

  /** One stored instance, or undefined when the index does not know it. */
  instance(sopUid: string): { header: InstanceHeader; path: string } | undefined {
    const r = this.db.prepare("SELECT header, path FROM instances WHERE sop_uid = ?").get(sopUid) as { header: string; path: string } | undefined;
    return r && { header: JSON.parse(r.header) as InstanceHeader, path: r.path };
  }

  seriesHeaders(seriesUid: string): { header: InstanceHeader; path: string }[] {
    const rows = this.db.prepare("SELECT header, path FROM instances WHERE series_uid = ?").all(seriesUid) as { header: string; path: string }[];
    return rows.map((r) => ({ header: JSON.parse(r.header) as InstanceHeader, path: r.path }));
  }

  /**
   * Re-derives a series' facts and types (DIR-003) from its instances. With `final`, also marks the
   * series ready (DIR-005); its thumbnail is rendered separately (`renderThumbnail`), because
   * decoding may need a codec (GEN-238).
   */
  refreshSeries(seriesUid: string, final: boolean): void {
    const rows = this.seriesHeaders(seriesUid);
    if (rows.length === 0) return;
    const { facts, types } = describeSeries(rows.map((r) => r.header));
    const sql = final
      ? "UPDATE series SET types = ?, facts = ?, image_count = ?, status = 'ready' WHERE series_uid = ?"
      : "UPDATE series SET types = ?, facts = ?, image_count = ? WHERE series_uid = ?";
    this.db.prepare(sql).run(JSON.stringify(types), JSON.stringify(facts), facts.imageCount, seriesUid);
  }

  /** Stored file and frame the series thumbnail is made from (`thumbnailInstance`, frames counted, GEN-240). */
  thumbnailSource(seriesUid: string): { path: string; frame: number } | undefined {
    const rows = this.seriesHeaders(seriesUid);
    const pick = thumbnailInstance(rows.flatMap((r) => expandFrames(r.header)));
    const path = rows.find((r) => r.header.sopInstanceUid === pick?.sopInstanceUid)?.path;
    return path ? { path, frame: pick?.frame ?? 0 } : undefined;
  }

  setThumbnail(seriesUid: string, png: Buffer | null): void {
    this.db.prepare("UPDATE series SET thumbnail = ? WHERE series_uid = ?").run(png, seriesUid);
  }

  /** Decodes and stores the thumbnail in this thread; callers run it off the interface thread. */
  async renderThumbnail(seriesUid: string): Promise<void> {
    const src = this.thumbnailSource(seriesUid);
    this.setThumbnail(seriesUid, src ? await thumbnailPng(src.path, src.frame) : null);
  }

  /**
   * Series left half-imported by a crash or forced quit are finished on the next start. Returns
   * their UIDs; the caller renders their thumbnails off the main thread.
   */
  recoverInterrupted(): string[] {
    const stale = this.db.prepare("SELECT series_uid FROM series WHERE status = 'importing'").all() as { series_uid: string }[];
    for (const s of stale) this.refreshSeries(s.series_uid, true);
    this.db.prepare("UPDATE imports SET phase = 'failed', error = 'interrupted', finished_at = ? WHERE phase IN ('scanning', 'reading', 'finishing')").run(new Date().toISOString());
    if (stale.length > 0) this.bumpIndexVersion();
    return stale.map((s) => s.series_uid);
  }

  startImport(source: "folder" | "dicomdir", root: string): number {
    const r = this.db.prepare("INSERT INTO imports (source, root, started_at, phase) VALUES (?, ?, ?, 'scanning')").run(source, root, new Date().toISOString());
    return Number(r.lastInsertRowid);
  }

  updateImport(p: ImportProgress): void {
    const finished = p.phase === "done" || p.phase === "cancelled" || p.phase === "failed" ? new Date().toISOString() : null;
    this.db
      .prepare("UPDATE imports SET phase = ?, found = ?, read = ?, imported = ?, duplicates = ?, not_dicom = ?, quarantined = ?, error = ?, finished_at = COALESCE(?, finished_at) WHERE id = ?")
      .run(p.phase, p.found, p.read, p.imported, p.duplicates, p.notDicom, p.quarantined, p.error ?? null, finished, p.importId);
  }

  addQuarantine(importId: number, path: string, reason: QuarantineReason, detail: string): void {
    this.db.prepare("INSERT INTO quarantine (import_id, path, reason, detail, at) VALUES (?, ?, ?, ?, ?)").run(importId, path, reason, detail, new Date().toISOString());
  }

  lastImport(): ImportProgress | null {
    const r = this.db.prepare("SELECT * FROM imports ORDER BY id DESC LIMIT 1").get() as ImportDbRow | undefined;
    if (!r) return null;
    const p: ImportProgress = { importId: r.id, source: r.source, root: r.root, phase: r.phase, found: r.found, read: r.read, imported: r.imported, duplicates: r.duplicates, notDicom: r.not_dicom, quarantined: r.quarantined, indexVersion: this.indexVersion() };
    if (r.error) p.error = r.error;
    return p;
  }

  /** Quarantine list of the most recent import (DIR-006). */
  quarantine(): QuarantineEntry[] {
    return this.db.prepare("SELECT path, reason, detail, at FROM quarantine WHERE import_id = (SELECT MAX(id) FROM imports) ORDER BY id").all() as QuarantineEntry[];
  }

  overview(): { studies: number; patients: number } {
    const r = this.db.prepare("SELECT COUNT(*) AS studies, COUNT(DISTINCT patient_id) AS patients FROM studies").get() as { studies: number; patients: number };
    return r;
  }

  /** Study list (DIR-009), newest first, filtered by patient name, patient ID or accession. */
  studies(search: string): StudyRow[] {
    const q = search.trim();
    const where = q ? "WHERE REPLACE(st.patient_name, '^', ' ') LIKE @p ESCAPE '\\' OR st.patient_name LIKE @p ESCAPE '\\' OR st.patient_id LIKE @p ESCAPE '\\' OR st.accession LIKE @p ESCAPE '\\'" : "";
    const rows = this.db
      .prepare(
        `SELECT st.*, COUNT(se.series_uid) AS series_count, SUM(se.image_count) AS image_count
         FROM studies st LEFT JOIN series se ON se.study_uid = st.study_uid
         ${where} GROUP BY st.study_uid ORDER BY st.study_date DESC, st.study_time DESC`,
      )
      .all(q ? { p: likePattern(q) } : {}) as StudyDbRow[];
    return rows.map((r) => ({
      studyInstanceUid: r.study_uid,
      patientName: r.patient_name,
      patientId: r.patient_id,
      patientBirthDate: isoDate(r.patient_birth_date),
      patientSex: r.patient_sex,
      studyDate: isoDate(r.study_date),
      studyDescription: r.study_description,
      accessionNumber: r.accession,
      modality: r.modality,
      fieldStrengthT: r.field_strength && r.field_strength > 0 ? r.field_strength : null,
      seriesCount: r.series_count,
      imageCount: r.image_count ?? 0,
    }));
  }

  /** Series of one study in series-number order (DIR-002). */
  series(studyUid: string): SeriesRow[] {
    const rows = this.db
      .prepare(
        `SELECT se.*, st.patient_id FROM series se JOIN studies st ON st.study_uid = se.study_uid
         WHERE se.study_uid = ? ORDER BY se.series_number IS NULL, se.series_number, se.description`,
      )
      .all(studyUid) as SeriesDbRow[];
    return rows.map((r) => {
      const f = r.facts ? (JSON.parse(r.facts) as SeriesFacts) : undefined;
      const row: SeriesRow = {
        seriesInstanceUid: r.series_uid,
        studyInstanceUid: r.study_uid,
        patientId: r.patient_id,
        description: r.description,
        types: JSON.parse(r.types) as SeriesType[],
        dynamics: f?.dynamics ?? 1,
        echoes: f?.echoes ?? 1,
        bValues: f?.bValues ?? [],
        gradientDirections: f?.gradientDirections ?? 0,
        isDynamic: (f?.dynamics ?? 1) >= 2,
        hasGeometry: f?.hasGeometry ?? false,
        preprocessingDone: r.status === "ready",
        seriesNumber: r.series_number,
        status: r.status,
        imageCount: r.image_count,
        slices: f?.slices ?? 0,
        rows: f?.rows ?? 0,
        columns: f?.columns ?? 0,
        thumbnail: r.thumbnail ? `data:image/png;base64,${r.thumbnail.toString("base64")}` : null,
        lossy: f?.lossy === true,
      };
      if (f?.flipAngle !== undefined) row.flipAngleDeg = f.flipAngle;
      return row;
    });
  }
}
