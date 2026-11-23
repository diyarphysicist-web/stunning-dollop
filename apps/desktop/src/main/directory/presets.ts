import { LayoutPreset, PresetCell, ViewerLayout } from "@neuromr/contracts";
import { z } from "zod";
import { uniqueName } from "./sessions.js";
import type { StudyIndex } from "./study-index.js";

interface PresetRow {
  id: number;
  name: string;
  layout: string;
  cells: string;
  saved_at: string;
}

const Cells = z.array(PresetCell.nullable()).max(9);

/** A stored preset, or null when the row no longer matches the schema (it is skipped, not fatal). */
function toPreset(r: PresetRow): LayoutPreset | null {
  try {
    const layout = ViewerLayout.safeParse(r.layout);
    const cells = Cells.safeParse(JSON.parse(r.cells));
    return layout.success && cells.success ? { id: r.id, name: r.name, layout: layout.data, cells: cells.data, savedAt: r.saved_at } : null;
  } catch {
    return null;
  }
}

/** User layout presets of the profile (GEN-243). */
export class PresetStore {
  constructor(
    private readonly index: StudyIndex,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(): LayoutPreset[] {
    const rows = this.index.db.prepare("SELECT id, name, layout, cells, saved_at FROM layout_presets ORDER BY id").all() as PresetRow[];
    return rows.map(toPreset).filter((p): p is LayoutPreset => p !== null);
  }

  private names(): string[] {
    return (this.index.db.prepare("SELECT name FROM layout_presets").all() as { name: string }[]).map((r) => r.name);
  }

  save(name: string, layout: ViewerLayout, cells: (PresetCell | null)[]): LayoutPreset {
    const unique = uniqueName(name, this.names());
    const savedAt = this.now().toISOString();
    const info = this.index.db.prepare("INSERT INTO layout_presets (name, layout, cells, saved_at) VALUES (?, ?, ?, ?)").run(unique, layout, JSON.stringify(cells), savedAt);
    return { id: Number(info.lastInsertRowid), name: unique, layout, cells, savedAt };
  }

  rename(id: number, name: string): LayoutPreset | null {
    const row = this.index.db.prepare("SELECT id, name, layout, cells, saved_at FROM layout_presets WHERE id = ?").get(id) as PresetRow | undefined;
    if (!row) return null;
    const unique = uniqueName(name, this.names().filter((n) => n !== row.name));
    this.index.db.prepare("UPDATE layout_presets SET name = ? WHERE id = ?").run(unique, id);
    return toPreset({ ...row, name: unique });
  }

  remove(id: number): boolean {
    return this.index.db.prepare("DELETE FROM layout_presets WHERE id = ?").run(id).changes > 0;
  }
}
