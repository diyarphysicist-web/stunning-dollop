import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ViewerSession } from "@neuromr/contracts";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore, uniqueName } from "./sessions.js";
import { StudyIndex } from "./study-index.js";

let dir: string;
let index: StudyIndex;
let clock = 0;
let store: SessionStore;

const session = (slice: number): ViewerSession => ({
  layout: "1x2",
  active: 1,
  panes: ["1.2.1", "1.2.2", null, null, null, null, null, null, null],
  series: {
    "1.2.1": {
      slice,
      point: 3,
      transform: { mirror: true, flip: false, quarterTurns: 1 },
      zoom: 1.5,
      pan: [4, -2],
      window: { lower: 10, upper: 200 },
      rois: [{ id: "roi-1", name: "Lesion", color: 0, slice, shape: { kind: "ellipse", center: [10, 12], a: 4, b: 2, angle: 0.3 } }],
      roiSerial: 1,
    },
  },
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "neuromr-sessions-"));
  index = new StudyIndex(join(dir, "index.sqlite"));
  clock = Date.UTC(2026, 10, 23, 12);
  store = new SessionStore(index, () => new Date((clock += 1000)));
});
afterEach(() => {
  index.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("GEN-241 Viewer sessions", () => {
  it("GEN-241 saves and restores the last state per study; a later save replaces it", () => {
    expect(store.get("1.2")).toBeNull();
    store.save("1.2", session(4));
    store.save("1.2", session(7));
    expect(store.get("1.2")).toEqual(session(7));
    expect(store.get("1.3")).toBeNull();
  });
  it("GEN-241 the state survives reopening the index", () => {
    store.save("1.2", session(5));
    index.close();
    index = new StudyIndex(join(dir, "index.sqlite"));
    expect(new SessionStore(index).get("1.2")?.series["1.2.1"]?.slice).toBe(5);
  });
  it("GEN-241 a row that no longer matches the schema is ignored", () => {
    index.db.prepare("INSERT INTO sessions VALUES ('1.9', '{\"layout\":\"9x9\"}', 'x')").run();
    expect(store.get("1.9")).toBeNull();
  });
  it("GEN-241 a schema 1 index gains the session tables", () => {
    index.close();
    const file = join(dir, "v1.sqlite");
    const raw = new Database(file);
    raw.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO meta VALUES ('index_version', 3);");
    raw.pragma("user_version = 1");
    raw.close();
    index = new StudyIndex(file);
    expect(index.db.pragma("user_version", { simple: true })).toBe(3);
    new SessionStore(index).save("1.2", session(1));
    expect(new SessionStore(index).get("1.2")).not.toBeNull();
  });
});

describe("GEN-242 Viewer bookmarks", () => {
  it("GEN-242 default names count up, newest first, state restored by id", () => {
    const a = store.addBookmark("1.2", session(1));
    const b = store.addBookmark("1.2", session(2));
    expect([a.name, b.name]).toEqual(["Bookmark 1", "Bookmark 2"]);
    expect(store.bookmarks("1.2").map((x) => x.name)).toEqual(["Bookmark 2", "Bookmark 1"]);
    expect(store.bookmark(a.id)?.series["1.2.1"]?.slice).toBe(1);
    expect(store.bookmarks("1.3")).toEqual([]);
  });
  it("GEN-242 rename keeps names unique (GEN-033 suffix); delete removes", () => {
    const a = store.addBookmark("1.2", session(1));
    const b = store.addBookmark("1.2", session(2));
    expect(store.rename(a.id, "Baseline")?.name).toBe("Baseline");
    expect(store.rename(b.id, "Baseline")?.name).toBe("Baseline 2");
    // Like ROI names (GEN-033), the next default is one past the highest default name still in use.
    expect(store.addBookmark("1.2", session(3)).name).toBe("Bookmark 1");
    expect(store.remove(a.id)).toBe(true);
    expect(store.remove(a.id)).toBe(false);
    expect(store.rename(a.id, "x")).toBeNull();
    expect(store.bookmarks("1.2").map((x) => x.name)).toEqual(["Bookmark 1", "Baseline 2"]);
  });
  it("GEN-242 uniqueName", () => {
    expect(uniqueName(" Plan ", [])).toBe("Plan");
    expect(uniqueName("Plan", ["Plan", "Plan 2"])).toBe("Plan 3");
  });
});
