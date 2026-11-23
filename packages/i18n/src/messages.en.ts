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
  "error.bridge": "The application could not read its own status. Restart NeuroMR-PRO.",
  "engine.label": "Engine",
  "engine.starting": "starting",
  "engine.connected": "connected",
  "engine.local": "local",
  "engine.restarting": "restarting, attempt {attempt} of {max}",
  "engine.unavailable": "unavailable",
  "engine.stopped": "stopped",
  "engine.hint.waiting": "Analyses can start once it is connected.",
  "engine.hint.notInstalled": "The compute engine is missing from this installation. Reinstall NeuroMR-PRO.",
  "engine.hint.failedToStart": "The compute engine could not start. Select Retry; if it fails again, restart NeuroMR-PRO.",
  "engine.hint.crashedRepeatedly": "The compute engine stopped several times. Select Retry; if it stops again, restart NeuroMR-PRO.",
  "engine.retry": "Retry",
  "import.dialog.folder": "Import DICOM folder",
  "import.dialog.dicomdir": "Import DICOMDIR",
  "import.dialog.dicomdirFilter": "DICOMDIR",
} as const satisfies Record<string, string>;

export type MessageId = keyof typeof en;
