import { create } from "zustand";

/** Activities on the rail that have shipped (rule 4: nothing appears before its phase). */
export type Activity = "directory" | "viewer";

interface ShellState {
  activity: Activity;
  show(activity: Activity): void;
}

export const useShell = create<ShellState>((set) => ({
  activity: "directory",
  show: (activity) => set({ activity }),
}));
