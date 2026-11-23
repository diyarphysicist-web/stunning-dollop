import type { Bookmark } from "@neuromr/contracts";
import { create } from "zustand";
import { invoke } from "../bridge.js";
import { buildSession } from "./session.js";
import { useViewer } from "./store.js";

/** Study of the active viewport's series, or null. */
export function activeStudy(): string | null {
  const st = useViewer.getState();
  const uid = st.panes[st.active]?.seriesUid;
  return (uid && st.studyOfSeries[uid]) || null;
}

interface BookmarkState {
  studyUid: string | null;
  list: Bookmark[];
  /** Lists the bookmarks of `studyUid` (GEN-242). */
  refresh(studyUid: string | null): Promise<void>;
  /** Saves the active study's current state under the next default name; returns it. */
  save(): Promise<Bookmark | null>;
  restore(id: number): Promise<boolean>;
  rename(id: number, name: string): Promise<void>;
  remove(id: number): Promise<void>;
}

/** Viewer bookmarks of the active study (GEN-242). */
export const useBookmarks = create<BookmarkState>((set, get) => ({
  studyUid: null,
  list: [],

  async refresh(studyUid) {
    set({ studyUid, ...(studyUid === get().studyUid ? {} : { list: [] }) });
    if (!studyUid) return;
    const r = await invoke("bookmark:list", { studyInstanceUid: studyUid });
    if (get().studyUid === studyUid) set({ list: r.ok ? r.value : [] });
  },

  async save() {
    const study = activeStudy();
    if (!study) return null;
    const r = await invoke("bookmark:save", { studyInstanceUid: study, session: buildSession(useViewer.getState(), study, null) });
    await get().refresh(study);
    return r.ok ? r.value : null;
  },

  async restore(id) {
    const study = get().studyUid;
    const r = await invoke("bookmark:get", { id });
    if (!study || !r.ok || !r.value) return false;
    await useViewer.getState().applySession(study, r.value, true);
    return true;
  },

  async rename(id, name) {
    if (!name.trim()) return;
    await invoke("bookmark:rename", { id, name });
    await get().refresh(get().studyUid);
  },

  async remove(id) {
    await invoke("bookmark:delete", { id });
    await get().refresh(get().studyUid);
  },
}));
