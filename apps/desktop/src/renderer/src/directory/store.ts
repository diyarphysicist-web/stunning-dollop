import { ImportProgress, type DirectoryOverview, type QuarantineEntry, type SeriesRow, type StudyRow } from "@neuromr/contracts";
import { create } from "zustand";
import { invoke } from "../bridge.js";

export type ImportNotice = "busy" | null;

interface DirectoryState {
  overview: DirectoryOverview | null;
  /** The running import, if any; the last finished one is in `overview.lastImport`. */
  running: ImportProgress | null;
  search: string;
  studies: StudyRow[];
  total: number;
  studyUid: string | null;
  series: SeriesRow[];
  /** Selected series in click order; the first is the primary input (DIR-004). */
  selected: string[];
  anchor: string | null;
  quarantine: QuarantineEntry[] | null;
  notice: ImportNotice;
  indexVersion: number;
  failed: boolean;

  refresh(): Promise<void>;
  setSearch(search: string): Promise<void>;
  selectStudy(uid: string): Promise<void>;
  clickSeries(uid: string, mode: "single" | "toggle" | "range"): void;
  startImport(source: "folder" | "dicomdir"): Promise<void>;
  cancelImport(): Promise<void>;
  openQuarantine(): Promise<void>;
  closeQuarantine(): void;
  onProgress(raw: unknown): void;
}

const ENDED = new Set(["done", "cancelled", "failed"]);

export const useDirectory = create<DirectoryState>((set, get) => {
  async function loadSeries(studyUid: string | null): Promise<void> {
    if (!studyUid) {
      set({ series: [], selected: [], anchor: null });
      return;
    }
    const r = await invoke("directory:series", { studyInstanceUid: studyUid });
    if (!r.ok) return set({ failed: true });
    const keep = get().selected.filter((uid) => r.value.some((s) => s.seriesInstanceUid === uid));
    set({ series: r.value, selected: keep, anchor: keep.includes(get().anchor ?? "") ? get().anchor : null });
  }

  async function loadStudies(): Promise<void> {
    const [all, shown] = await Promise.all([invoke("directory:overview", {}), invoke("directory:studies", { search: get().search })]);
    if (!all.ok || !shown.ok) return set({ failed: true });
    const current = get().studyUid;
    const studyUid = shown.value.some((s) => s.studyInstanceUid === current) ? current : (shown.value[0]?.studyInstanceUid ?? null);
    if (studyUid !== current) set({ selected: [], anchor: null });
    set({ overview: all.value, studies: shown.value, total: all.value.studies, studyUid, failed: false });
    await loadSeries(studyUid);
  }

  return {
    overview: null,
    running: null,
    search: "",
    studies: [],
    total: 0,
    studyUid: null,
    series: [],
    selected: [],
    anchor: null,
    quarantine: null,
    notice: null,
    indexVersion: -1,
    failed: false,

    refresh: loadStudies,

    async setSearch(search) {
      set({ search });
      await loadStudies();
    },

    async selectStudy(uid) {
      if (uid === get().studyUid) return;
      set({ studyUid: uid, selected: [], anchor: null });
      await loadSeries(uid);
    },

    clickSeries(uid, mode) {
      const { selected, anchor, series } = get();
      if (mode === "toggle") {
        const next = selected.includes(uid) ? selected.filter((u) => u !== uid) : [...selected, uid];
        return set({ selected: next, anchor: uid });
      }
      if (mode === "range" && anchor) {
        const order = series.map((s) => s.seriesInstanceUid);
        const [a, b] = [order.indexOf(anchor), order.indexOf(uid)].sort((x, y) => x - y) as [number, number];
        const range = order.slice(a, b + 1);
        // The anchor stays the primary series; the rest follow in list order.
        return set({ selected: [anchor, ...range.filter((u) => u !== anchor)] });
      }
      set({ selected: [uid], anchor: uid });
    },

    async startImport(source) {
      set({ notice: null });
      const r = await invoke("directory:import", { source });
      if (r.ok && !r.value.started && r.value.why === "busy") set({ notice: "busy" });
    },

    async cancelImport() {
      await invoke("directory:cancel-import", {});
    },

    async openQuarantine() {
      const r = await invoke("directory:quarantine", {});
      if (r.ok) set({ quarantine: r.value });
    },

    closeQuarantine() {
      set({ quarantine: null });
    },

    onProgress(raw) {
      const p = ImportProgress.safeParse(raw);
      if (!p.success) return;
      const ended = ENDED.has(p.data.phase);
      set({ running: ended ? null : p.data, notice: null });
      if (ended || p.data.indexVersion !== get().indexVersion) {
        set({ indexVersion: p.data.indexVersion });
        void loadStudies();
      }
    },
  };
});

/** Subscribes the store to import pushes and loads the index once. */
export function connectDirectory(): () => void {
  const store = useDirectory.getState();
  void store.refresh();
  return window.neuromr.onImportProgress((p) => useDirectory.getState().onProgress(p));
}
