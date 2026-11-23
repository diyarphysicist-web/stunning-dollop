import type { LayoutPreset, PresetCell, SeriesRow } from "@neuromr/contracts";
import { create } from "zustand";
import { invoke } from "../bridge.js";
import { useDirectory } from "../directory/store.js";
import { activeStudy } from "./bookmarks.js";
import { LAYOUTS, cellCount, type Layout } from "./stack.js";
import { useViewer } from "./store.js";

/** "system:2x2" or "user:<id>". */
export type PresetKey = `system:${Layout}` | `user:${number}`;

/**
 * GEN-243: for each viewport of a preset, an unused series of its type, preferring the same
 * description, then the lowest series number; a cell without a type matches by description only.
 */
export function matchPreset(cells: readonly (PresetCell | null)[], series: readonly SeriesRow[]): (string | null)[] {
  const used = new Set<string>();
  const byNumber = [...series].sort((a, b) => (a.seriesNumber ?? Number.MAX_SAFE_INTEGER) - (b.seriesNumber ?? Number.MAX_SAFE_INTEGER));
  return cells.map((cell) => {
    if (!cell) return null;
    const fits = byNumber.filter((s) => !used.has(s.seriesInstanceUid) && (cell.type ? s.types.includes(cell.type) : s.description === cell.description));
    const pick = fits.find((s) => s.description === cell.description) ?? fits[0];
    if (!pick) return null;
    used.add(pick.seriesInstanceUid);
    return pick.seriesInstanceUid;
  });
}

/** What each viewport of the current layout shows, as a preset stores it (GEN-243). */
export function currentCells(series: readonly SeriesRow[]): (PresetCell | null)[] {
  const st = useViewer.getState();
  return st.panes.slice(0, cellCount(st.layout)).map((p) => {
    const row = series.find((s) => s.seriesInstanceUid === p.seriesUid);
    if (row) return { type: row.types[0] ?? null, description: row.description };
    return p.stack ? { type: null, description: p.stack.description } : null;
  });
}

/** The study a preset applies to: the active viewport's, else the one selected in the Directory. */
function targetStudy(): string | null {
  return activeStudy() ?? useDirectory.getState().studyUid;
}

async function seriesOf(studyUid: string | null): Promise<SeriesRow[]> {
  if (!studyUid) return [];
  const r = await invoke("directory:series", { studyInstanceUid: studyUid });
  return r.ok ? r.value : [];
}

interface PresetState {
  open: boolean;
  /** Open with the "Save current layout as…" name field focused (Ctrl+Shift+L). */
  naming: boolean;
  list: LayoutPreset[];
  selected: PresetKey;
  /** Last user preset applied; it stays active while the grid still has its layout. */
  activeId: number | null;
  show(naming?: boolean): Promise<void>;
  close(): void;
  select(key: PresetKey): void;
  setNaming(naming: boolean): void;
  refresh(): Promise<void>;
  saveCurrent(name: string): Promise<LayoutPreset | null>;
  rename(id: number, name: string): Promise<void>;
  remove(id: number): Promise<void>;
  apply(key: PresetKey): Promise<void>;
}

export const usePresets = create<PresetState>((set, get) => ({
  open: false,
  naming: false,
  list: [],
  selected: `system:${useViewer.getState().layout}`,
  activeId: null,

  async show(naming = false) {
    const active = activeUserPreset(get());
    set({ open: true, naming, selected: active ? `user:${active}` : `system:${useViewer.getState().layout}` });
    await get().refresh();
  },
  close: () => set({ open: false, naming: false }),
  select: (selected) => set({ selected }),
  setNaming: (naming) => set({ naming }),

  async refresh() {
    const r = await invoke("preset:list", {});
    if (r.ok) set({ list: r.value });
  },

  async saveCurrent(name) {
    if (!name.trim()) return null;
    const cells = currentCells(await seriesOf(targetStudy()));
    const r = await invoke("preset:save", { name, layout: useViewer.getState().layout, cells });
    await get().refresh();
    if (!r.ok) return null;
    set({ selected: `user:${r.value.id}`, naming: false, activeId: r.value.id });
    return r.value;
  },

  async rename(id, name) {
    if (!name.trim()) return;
    await invoke("preset:rename", { id, name });
    await get().refresh();
  },

  async remove(id) {
    if (activeUserPreset(get()) === id) return;
    await invoke("preset:delete", { id });
    set({ selected: `system:${useViewer.getState().layout}` });
    await get().refresh();
  },

  async apply(key) {
    const [kind, value] = key.split(":") as ["system" | "user", string];
    if (kind === "system") {
      useViewer.getState().setLayout(value as Layout);
      set({ activeId: null, open: false });
      return;
    }
    const preset = get().list.find((p) => p.id === Number(value));
    if (!preset) return;
    const cells = preset.cells.slice(0, cellCount(preset.layout));
    const uids = matchPreset(cells, await seriesOf(targetStudy()));
    set({ activeId: preset.id, open: false });
    await useViewer.getState().showLayout(preset.layout, uids, cells);
  },
}));

/** The active user preset's id: the last applied one, while the grid still has its layout. */
export function activeUserPreset(st: Pick<PresetState, "activeId" | "list">): number | null {
  const p = st.list.find((x) => x.id === st.activeId);
  return p && p.layout === useViewer.getState().layout ? p.id : null;
}

export const SYSTEM_KEYS: PresetKey[] = LAYOUTS.map((l) => `system:${l}` as const);
