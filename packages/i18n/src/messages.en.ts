/**
 * The single English message catalog (GEN-200). ICU message format; every user-facing string in
 * the product is a key here. Quantities passed as `{n, number}` are formatted en-US (GEN-201);
 * identifiers (ports, series numbers, versions) are passed as preformatted strings.
 */
export const en = {
  "app.name": "NeuroMR-PRO",
  "app.version": "Version {version}",
  "app.windowTitle": "{study, select, none {NeuroMR-PRO} other {{study} — NeuroMR-PRO}}",
  "banner.label": "Patient",
  "banner.noPatient": "No patient selected",
  "rail.label": "Activities",
  "rail.directory": "Directory",
  "rail.directory.hint": "Directory (Ctrl+1)",
  "window.minimize": "Minimise",
  "window.maximize": "Maximise",
  "window.restore": "Restore down",
  "window.close": "Close",
  "status.noStudy": "No study open",
  "status.platform": "{platform} {arch} · Electron {electron}",
  "error.bridge": "The application could not read its own status. Restart NeuroMR-PRO; if this repeats, collect diagnostics from Help.",
} as const satisfies Record<string, string>;

export type MessageId = keyof typeof en;
