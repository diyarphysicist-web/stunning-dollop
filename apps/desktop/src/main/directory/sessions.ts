import { ViewerSession, type Bookmark } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import type { StudyIndex } from "./study-index.js";

interface BookmarkRow {
  id: number;
  study_uid: string;
  name: string;
  saved_at: string;
}
const toBookmark = (r: BookmarkRow): Bookmark => ({ id: r.id, studyInstanceUid: r.study_uid, name: r.name, savedAt: r.saved_at });

/** Stored state, or null when it no longer matches the schema (an older or damaged row is ignored, not fatal). */
function parseState(json: string): ViewerSession | null {
  try {
    const r = ViewerSession.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** "Name", then "Name 2", "Name 3", … (GEN-033 rule, used for bookmark names, GEN-242). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const base = name.trim();
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Viewer sessions (GEN-241) and bookmarks (GEN-242) in the study index. */
export class SessionStore {
  constructor(
    private readonly index: StudyIndex,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(studyUid: string): ViewerSession | null {
    const row = this.index.db.prepare("SELECT state FROM sessions WHERE study_uid = ?").get(studyUid) as { state: string } | undefined;
    return row ? parseState(row.state) : null;
  }

  save(studyUid: string, session: ViewerSession): void {
    this.index.db
      .prepare("INSERT INTO sessions (study_uid, state, saved_at) VALUES (?, ?, ?) ON CONFLICT (study_uid) DO UPDATE SET state = excluded.state, saved_at = excluded.saved_at")
      .run(studyUid, JSON.stringify(session), this.now().toISOString());
  }

  bookmarks(studyUid: string): Bookmark[] {
    const rows = this.index.db.prepare("SELECT id, study_uid, name, saved_at FROM bookmarks WHERE study_uid = ? ORDER BY saved_at DESC, id DESC").all(studyUid) as BookmarkRow[];
    return rows.map(toBookmark);
  }

  private names(studyUid: string): string[] {
    return (this.index.db.prepare("SELECT name FROM bookmarks WHERE study_uid = ?").all(studyUid) as { name: string }[]).map((r) => r.name);
  }

  /** Saves under the next default name, "Bookmark n" one past the highest n of the study (GEN-242). */
  addBookmark(studyUid: string, session: ViewerSession): Bookmark {
    const taken = this.names(studyUid);
    // Default names are the catalog's "Bookmark {n}"; the number is whatever follows its prefix.
    const prefix = t("bookmark.defaultName", { n: 0 }).replace(/0$/, "");
    const numberOf = (name: string) => (name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)) ? Number(name.slice(prefix.length)) : 0);
    const highest = Math.max(0, ...taken.map(numberOf));
    const name = uniqueName(t("bookmark.defaultName", { n: highest + 1 }), taken);
    const savedAt = this.now().toISOString();
    const info = this.index.db.prepare("INSERT INTO bookmarks (study_uid, name, state, saved_at) VALUES (?, ?, ?, ?)").run(studyUid, name, JSON.stringify(session), savedAt);
    return { id: Number(info.lastInsertRowid), studyInstanceUid: studyUid, name, savedAt };
  }

  bookmark(id: number): ViewerSession | null {
    const row = this.index.db.prepare("SELECT state FROM bookmarks WHERE id = ?").get(id) as { state: string } | undefined;
    return row ? parseState(row.state) : null;
  }

  rename(id: number, name: string): Bookmark | null {
    const row = this.index.db.prepare("SELECT id, study_uid, name, saved_at FROM bookmarks WHERE id = ?").get(id) as BookmarkRow | undefined;
    if (!row) return null;
    const unique = uniqueName(name, this.names(row.study_uid).filter((n) => n !== row.name));
    this.index.db.prepare("UPDATE bookmarks SET name = ? WHERE id = ?").run(unique, id);
    return toBookmark({ ...row, name: unique });
  }

  remove(id: number): boolean {
    return this.index.db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id).changes > 0;
  }
}
