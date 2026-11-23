import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PresetStore } from "./presets.js";
import { StudyIndex } from "./study-index.js";

let dir: string;
let index: StudyIndex;
let store: PresetStore;
const cells = [{ type: "DSC" as const, description: "DSC perf" }, null, { type: null, description: "Localiser" }];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "neuromr-presets-"));
  index = new StudyIndex(join(dir, "index.sqlite"));
  store = new PresetStore(index, () => new Date(Date.UTC(2026, 10, 23)));
});
afterEach(() => {
  index.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("GEN-243 layout presets storage", () => {
  it("GEN-243 saves, lists in order, keeps names unique, renames and deletes", () => {
    const a = store.save("DSC reading", "2x2", cells);
    const b = store.save("DSC reading", "1x2", [null, null]);
    expect(b.name).toBe("DSC reading 2");
    expect(store.list().map((p) => [p.name, p.layout])).toEqual([["DSC reading", "2x2"], ["DSC reading 2", "1x2"]]);
    expect(store.list()[0]?.cells).toEqual(cells);
    expect(store.rename(b.id, "DSC reading")?.name).toBe("DSC reading 2");
    expect(store.rename(b.id, "Mismatch")?.name).toBe("Mismatch");
    expect(store.remove(a.id)).toBe(true);
    expect(store.remove(a.id)).toBe(false);
    expect(store.rename(a.id, "x")).toBeNull();
    expect(store.list().map((p) => p.name)).toEqual(["Mismatch"]);
  });
  it("GEN-243 a damaged row is skipped", () => {
    index.db.prepare("INSERT INTO layout_presets (name, layout, cells, saved_at) VALUES ('bad', '4x4', '[]', 'x')").run();
    expect(store.list()).toEqual([]);
  });
  it("GEN-243 a schema 2 index gains the presets table", () => {
    index.close();
    const file = join(dir, "v2.sqlite");
    const raw = new Database(file);
    raw.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO meta VALUES ('index_version', 3);");
    raw.pragma("user_version = 2");
    raw.close();
    index = new StudyIndex(file);
    expect(index.db.pragma("user_version", { simple: true })).toBe(3);
    expect(new PresetStore(index).save("A", "1x1", [null]).name).toBe("A");
  });
});
