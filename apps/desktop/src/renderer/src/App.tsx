import type { AppInfo, EngineStatus, WindowState } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { useEffect, useState } from "react";
import { invoke } from "./bridge.js";
import { Directory } from "./directory/Directory.js";
import { ageYears, modalityLabel } from "./directory/format.js";
import { connectDirectory, useDirectory } from "./directory/store.js";
import { EngineStatusItem, useEngineStatus } from "./EngineStatusItem.js";
import { Icon, IconSprite } from "./Icon.js";
import { useShell, type Activity } from "./shell.js";
import { cellCount } from "./viewer/stack.js";
import { useViewer } from "./viewer/store.js";
import { RenderingStatusItem, Viewer } from "./viewer/Viewer.js";

/** SAFE-001: the patient of the selected study is always in view. */
function PatientBanner() {
  const study = useDirectory((s) => s.studies.find((x) => x.studyInstanceUid === s.studyUid));
  if (!study) return <div className="banner" aria-label={t("banner.label")}><span className="t2">{t("banner.noPatient")}</span></div>;
  const age = ageYears(study.patientBirthDate, study.studyDate);
  return (
    <div className="banner" aria-label={t("banner.label")} data-testid="patient-banner">
      <span className="banner__name">{study.patientName}</span>
      <span className="bf"><span className="bf__k">{t("banner.id")}</span><span className="bf__v mono">{study.patientId}</span></span>
      <span className="bf"><span className="bf__k">{t("banner.sex")}</span><span className="bf__v">{study.patientSex}</span></span>
      {age !== undefined && <span className="bf"><span className="bf__k">{t("banner.age")}</span><span className="bf__v">{t("banner.ageValue", { years: age })}</span><span className="bf__k">{t("banner.dob", { dob: study.patientBirthDate })}</span></span>}
      <span className="bf"><span className="bf__k">{t("banner.study")}</span><span className="bf__v">{study.studyDate}</span></span>
      <span className="bf"><span className="bf__k">{t("banner.modality")}</span><span className="bf__v">{modalityLabel(study)}</span></span>
      <span className="bf"><span className="bf__k">{t("banner.accession")}</span><span className="bf__v mono">{study.accessionNumber}</span></span>
    </div>
  );
}

function ImportStatusItem() {
  const running = useDirectory((s) => s.running);
  if (!running) return null;
  const pct = running.found > 0 ? Math.floor((running.read / running.found) * 100) : 0;
  return (
    <>
      <span className="sb-item" data-testid="import-status"><span className="dot dot--warning" /><b>{t("status.importing")}</b>{t("punct.dotSpaced")}{t("status.importDetail", { read: running.read, found: running.found, pct })}</span>
      <span className="sb-sep" />
    </>
  );
}

function TopBar({ maximized }: { maximized: boolean }) {
  const control = (action: "minimize" | "toggle-maximize" | "close") => void invoke("window:control", { action });
  return (
    <header className="topbar">
      <div className="brand"><Icon name="brand" className="brand__mark" />{t("app.name")}</div>
      <PatientBanner />
      <div className="topbar__actions">
        <div className="winctl">
          <button aria-label={t("window.minimize")} title={t("window.minimize")} onClick={() => control("minimize")}><Icon name="min" small /></button>
          <button aria-label={t(maximized ? "window.restore" : "window.maximize")} title={t(maximized ? "window.restore" : "window.maximize")} onClick={() => control("toggle-maximize")}><Icon name="max" small /></button>
          <button className="winctl__close" aria-label={t("window.close")} title={t("window.close")} onClick={() => control("close")}><Icon name="close" small /></button>
        </div>
      </div>
    </header>
  );
}

const ACTIVITIES: [Activity, string, "rail.directory" | "rail.viewer", "rail.directory.hint" | "rail.viewer.hint"][] = [
  ["directory", "directory", "rail.directory", "rail.directory.hint"],
  ["viewer", "viewer", "rail.viewer", "rail.viewer.hint"],
];

function Rail() {
  const activity = useShell((s) => s.activity);
  return (
    <nav className="rail" aria-label={t("rail.label")}>
      {ACTIVITIES.map(([id, icon, label, hint]) => (
        <button key={id} className={`rail__item${activity === id ? " is-active" : ""}`} aria-current={activity === id ? "page" : undefined} aria-label={t(hint)} title={t(hint)} data-activity={id} onClick={() => useShell.getState().show(id)}>
          <Icon name={icon} />
          {t(label)}
        </button>
      ))}
    </nav>
  );
}

/** GEN-237: what the Viewer has open, for the active viewport. */
function OpenItem() {
  const activity = useShell((s) => s.activity);
  const stack = useViewer((s) => s.panes[s.active]?.stack ?? s.panes.find((p) => p.stack)?.stack ?? null);
  const shown = useViewer((s) => new Set(s.panes.slice(0, cellCount(s.layout)).flatMap((p) => (p.stack ? [p.stack.seriesInstanceUid] : []))).size);
  const study = useDirectory((s) => s.studies.find((x) => x.studyInstanceUid === stack?.studyInstanceUid));
  if (activity !== "viewer" || !stack) return <span className="sb-item" data-testid="status-open"><span className="dot dot--idle" /><b>{t("status.noStudy")}</b></span>;
  const name = study?.studyDescription || study?.accessionNumber || stack.patientId;
  return (
    <span className="sb-item" data-testid="status-open">
      <span className="dot dot--success" />
      <b>{t("status.open", { study: name, number: stack.seriesNumber === null ? "none" : String(stack.seriesNumber), series: stack.description })}</b>
      {shown > 1 && <>{t("punct.dotSpaced")}{t("status.openMore", { n: shown })}</>}
    </span>
  );
}

function StatusBar({ info, failed, engine }: { info: AppInfo | null; failed: boolean; engine: EngineStatus | null }) {
  return (
    <footer className="statusbar">
      <OpenItem />
      <span className="sb-sep" />
      <ImportStatusItem />
      <RenderingStatusItem />
      <EngineStatusItem status={engine} />
      <span className="spacer" />
      {failed && <span className="sb-item"><span className="dot dot--critical" />{t("error.bridge")}</span>}
      {info && <span className="sb-item">{t("app.version", { version: info.version })}</span>}
    </footer>
  );
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [win, setWin] = useState<WindowState>({ maximized: false, focused: true });
  const engine = useEngineStatus();

  useEffect(() => {
    void invoke("app:info", {}).then((r) => (r.ok ? setInfo(r.value) : setFailed(true)));
    void invoke("window:control", { action: "query" }).then((r) => r.ok && setWin(r.value));
    const offWindow = window.neuromr.onWindowState(setWin);
    const offDirectory = connectDirectory();
    // Ctrl+1…2 switch activities (COMPONENTS.md: activity rail).
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const next = ({ "1": "directory", "2": "viewer" } as const)[e.key as "1" | "2"];
      if (next) {
        e.preventDefault();
        useShell.getState().show(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      offWindow();
      offDirectory();
    };
  }, []);

  const activity = useShell((s) => s.activity);
  return (
    <div className={activity === "directory" ? "app app--no-inspector" : "app"} data-activity={activity}>
      <IconSprite />
      <TopBar maximized={win.maximized} />
      <Rail />
      {activity === "directory" ? <Directory /> : <Viewer />}
      <StatusBar info={info} failed={failed} engine={engine} />
    </div>
  );
}
