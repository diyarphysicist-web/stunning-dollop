import type { ImportProgress, QuarantineEntry, SeriesRow, StudyRow } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { Icon } from "../Icon.js";
import { dimensions, modalityLabel } from "./format.js";
import { useDirectory } from "./store.js";

/** Thumbnails are decorative: the series description next to them names the series. */
const DECORATIVE = "";

function percent(p: ImportProgress): number {
  return p.found > 0 ? Math.floor((p.read / p.found) * 100) : 0;
}

function ImportSection() {
  const running = useDirectory((s) => s.running);
  const last = useDirectory((s) => s.overview?.lastImport ?? null);
  const notice = useDirectory((s) => s.notice);
  const { startImport, cancelImport } = useDirectory.getState();

  if (running) {
    return (
      <section className="psec" data-testid="import-running">
        <span className="eyebrow">{t("import.title")}</span>
        <span className="dense">{t(running.source === "folder" ? "import.source.folder" : "import.source.dicomdir")} <span className="mono">{running.root}</span></span>
        {running.phase === "scanning" ? (
          <span className="progress"><span className="t2">{t("import.scanning")}</span><button className="link dense" onClick={() => void cancelImport()}>{t("import.cancel")}</button></span>
        ) : (
          <span className="progress">
            <span className="progress__bar" style={{ "--v": `${percent(running)}%` } as React.CSSProperties} />
            <span className="progress__pct">{t("import.percent", { pct: percent(running) })}</span>
            <span className="t2">{t("import.files", { read: running.read, found: running.found })}</span>
            <button className="link dense" onClick={() => void cancelImport()}>{t("import.cancel")}</button>
          </span>
        )}
        <span className="field__hint">{t("import.runningHint")}</span>
      </section>
    );
  }
  return (
    <section className="psec">
      <span className="eyebrow">{t("import.title")}</span>
      <div className="psec__row">
        <button className="btn btn--secondary btn--dense" onClick={() => void startImport("folder")} title={t("import.folderShortcut")}>
          {t("import.folder")} <span className="kbd">{t("shortcut.ctrlO")}</span>
        </button>
        <button className="btn btn--secondary btn--dense" onClick={() => void startImport("dicomdir")}>{t("import.dicomdir")}</button>
      </div>
      <span className="field__hint">{t("import.hint")}</span>
      {notice === "busy" && <span className="field__hint">{t("import.busy")}</span>}
      {last?.phase === "done" && <span className="field__hint" data-testid="import-summary">{t("import.summary", { imported: last.imported, duplicates: last.duplicates, notDicom: last.notDicom })}</span>}
      {last?.phase === "cancelled" && <span className="field__hint">{t("import.cancelled", { imported: last.imported })}</span>}
    </section>
  );
}

function SourcesPanel() {
  const overview = useDirectory((s) => s.overview);
  const openQuarantine = useDirectory((s) => s.openQuarantine);
  const last = overview?.lastImport ?? null;
  const quarantined = last && last.phase !== "scanning" && last.phase !== "reading" ? last.quarantined : 0;
  return (
    <aside className="panel" aria-label={t("sources.label")}>
      <div className="panel__head">
        <div className="panel__head-row"><h1 className="panel__title">{t("sources.title")}</h1></div>
      </div>
      <div className="panel__body">
        <section className="psec">
          <span className="eyebrow">{t("sources.workstation")}</span>
          <div className="src">
            <div className="src__item is-selected">
              <Icon name="directory" /><b>{t("sources.localStore")}</b><span className="t2">{t("sources.studies", { n: overview?.studies ?? 0 })}</span>
              <span className="src__sub">{t("sources.patients", { n: overview?.patients ?? 0 })}</span>
            </div>
          </div>
        </section>
        <ImportSection />
        {last?.phase === "failed" && last.error && (
          <section className="psec">
            <div className="notice notice--critical" role="alert"><Icon name="warn" /><span className="notice__text">{t("import.failed", { error: last.error })}</span></div>
          </section>
        )}
        {quarantined > 0 && (
          <section className="psec" style={{ borderBottom: 0 }}>
            <div className="notice notice--warning" role="note" data-testid="quarantine-notice">
              <Icon name="warn" />
              <span className="notice__text">
                {t("quarantine.notice", { n: quarantined })}{t("punct.dashSpaced")}
                <button className="link dense" onClick={() => void openQuarantine()}>{t("quarantine.review")}</button>{t("punct.period")}
              </span>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function Toolbar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const search = useDirectory((s) => s.search);
  const setSearch = useDirectory((s) => s.setSearch);
  return (
    <div className="toolbar" role="toolbar" aria-label={t("toolbar.label")}>
      <label className="search" role="search">
        <Icon name="search" />
        <input ref={searchRef} type="search" value={search} placeholder={t("search.placeholder")} aria-label={t("search.label")} onChange={(e) => void setSearch(e.target.value)} />
        <span className="kbd">{t("shortcut.ctrlK")}</span>
      </label>
    </div>
  );
}

function StudyTable() {
  const studies = useDirectory((s) => s.studies);
  const total = useDirectory((s) => s.total);
  const studyUid = useDirectory((s) => s.studyUid);
  const search = useDirectory((s) => s.search);
  const selectStudy = useDirectory((s) => s.selectStudy);
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : -1;
    const target = studies[next];
    if (target) {
      e.preventDefault();
      void selectStudy(target.studyInstanceUid);
      (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
    }
  };
  const cols = ["16%", "13%", "9%", "5%", "9%", undefined, "6%", "7%", "7%", "10%"];
  return (
    <section className="dir__block dir__block--studies" aria-label={t("studies.title")}>
      <div className="dir__head"><h2>{t("studies.title")}</h2><span className="dense t3">{t("studies.count", { shown: studies.length, total })}</span></div>
      <div className="dir__scroll">
        <table className="tbl" data-testid="study-list">
          <colgroup>{cols.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead>
            <tr>
              <th>{t("studies.patient")}</th><th>{t("studies.patientId")}</th><th>{t("studies.birthDate")}</th><th>{t("studies.sex")}</th><th>{t("studies.studyDate")}</th>
              <th>{t("studies.description")}</th><th className="num">{t("studies.series")}</th><th className="num">{t("studies.images")}</th><th>{t("studies.modality")}</th><th>{t("studies.accession")}</th>
            </tr>
          </thead>
          <tbody>
            {studies.map((s: StudyRow, i) => {
              const selected = s.studyInstanceUid === studyUid;
              return (
                <tr key={s.studyInstanceUid} className={selected ? "is-selected" : undefined} aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => void selectStudy(s.studyInstanceUid)} onKeyDown={(e) => move(e, i)}>
                  <td className="strong mono">{s.patientName}</td><td className="mono">{s.patientId}</td><td>{s.patientBirthDate}</td><td>{s.patientSex}</td><td>{s.studyDate}</td>
                  <td>{s.studyDescription}</td><td className="num">{t("number.count", { n: s.seriesCount })}</td><td className="num">{t("number.count", { n: s.imageCount })}</td><td>{modalityLabel(s)}</td><td className="mono">{s.accessionNumber}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {studies.length === 0 && search && <div className="empty dir__nomatch"><span>{t("studies.noMatch", { query: search })}</span></div>}
      </div>
    </section>
  );
}

function TypeBadges({ series }: { series: SeriesRow }) {
  if (series.types.length === 0) return <span className="t3">{series.status === "ready" ? t("series.noType") : ""}</span>;
  return <>{series.types.map((type) => <span key={type} className="type">{t(`seriesType.${type}`)}</span>)}</>;
}

function SeriesTable() {
  const series = useDirectory((s) => s.series);
  const selected = useDirectory((s) => s.selected);
  const study = useDirectory((s) => s.studies.find((x) => x.studyInstanceUid === s.studyUid));
  const running = useDirectory((s) => s.running);
  const clickSeries = useDirectory((s) => s.clickSeries);
  if (!study) return null;
  const importing = running !== null && series.some((s) => s.status === "importing");
  const onClick = (e: MouseEvent, uid: string) => clickSeries(uid, e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "single");
  const cols = ["5%", "5%", "22%", "20%", "8%", "16%", undefined];
  return (
    <section className="dir__block" aria-label={t("series.title")} style={{ borderBottom: 0 }}>
      <div className="dir__head">
        <h2>{t("series.title")}</h2>
        <span className="dense t3">{importing ? t("series.countImporting", { date: study.studyDate, n: series.length }) : t("series.count", { date: study.studyDate, n: series.length, selected: selected.length })}</span>
        <span className="spacer" />
        <span className="dense t3">{t("series.multiHint")}</span>
      </div>
      <div className="dir__scroll">
        <table className="tbl tbl--series" data-testid="series-list" aria-multiselectable="true">
          <colgroup>{cols.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead>
            <tr><th /><th className="num">{t("series.number")}</th><th>{t("series.description")}</th><th>{t("series.type")}</th><th className="num">{t("series.images")}</th><th>{t("series.dimensions")}</th><th>{t("series.status")}</th></tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const isSel = selected.includes(s.seriesInstanceUid);
              return (
                <tr key={s.seriesInstanceUid} className={isSel ? "is-selected" : undefined} aria-selected={isSel} onClick={(e) => onClick(e, s.seriesInstanceUid)}>
                  <td><span className="thumb">{s.thumbnail && <img src={s.thumbnail} alt={DECORATIVE} />}</span></td>
                  <td className="num">{s.seriesNumber ?? ""}</td>
                  <td className="strong">{s.description}</td>
                  <td><TypeBadges series={s} /></td>
                  <td className="num">{t("number.count", { n: s.imageCount })}</td>
                  <td>{dimensions(s)}</td>
                  <td>
                    {s.status === "ready" ? (
                      <span className="cell-flex"><span className="dot dot--success" />{t("series.status.ready")}</span>
                    ) : (
                      <span className="cell-flex"><span className="dot dot--warning" /><span className="t2">{t("series.status.importing")}</span></span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyState() {
  const startImport = useDirectory((s) => s.startImport);
  return (
    <main className="dir dir--empty" aria-label={t("dir.label")}>
      <div className="empty empty--big" data-testid="directory-empty">
        <Icon name="directory" />
        <span className="empty__title">{t("empty.title")}</span>
        <span>{t("empty.body")}</span>
        <div className="psec__row empty__actions">
          <button className="btn btn--primary" onClick={() => void startImport("folder")}>{t("empty.importFolder")} <span className="kbd">{t("shortcut.ctrlO")}</span></button>
          <button className="btn btn--secondary" onClick={() => void startImport("dicomdir")}>{t("import.dicomdir")}</button>
        </div>
      </div>
    </main>
  );
}

function QuarantineDialog({ entries }: { entries: QuarantineEntry[] }) {
  const close = useDirectory((s) => s.closeQuarantine);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <div className="scrim" onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="quarantine-title">
        <div className="dialog__head"><span className="dialog__title" id="quarantine-title">{t("quarantine.title")}</span></div>
        <div className="dialog__body dialog__body--scroll">
          <table className="tbl tbl--dense" data-testid="quarantine-list">
            <thead><tr><th>{t("quarantine.file")}</th><th>{t("quarantine.reason")}</th><th>{t("quarantine.time")}</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{e.path}</td>
                  <td>{t(`quarantine.reason.${e.reason}`, { detail: e.detail })}</td>
                  <td>{e.at.slice(11, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dialog__foot"><button ref={closeRef} className="btn btn--secondary" onClick={close}>{t("quarantine.close")}</button></div>
      </div>
    </div>
  );
}

/** Study Directory (screen 01; DIR-001…009). The launcher column arrives with the first package (rule 4). */
export function Directory() {
  const searchRef = useRef<HTMLInputElement>(null);
  const total = useDirectory((s) => s.total);
  const loaded = useDirectory((s) => s.overview !== null);
  const running = useDirectory((s) => s.running);
  const quarantine = useDirectory((s) => s.quarantine);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === "o") {
        e.preventDefault();
        void useDirectory.getState().startImport("folder");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const empty = loaded && total === 0 && !running;
  return (
    <>
      <SourcesPanel />
      <Toolbar searchRef={searchRef} />
      {empty ? (
        <EmptyState />
      ) : (
        <main className="dir" aria-label={t("dir.label")}>
          <StudyTable />
          <SeriesTable />
        </main>
      )}
      {quarantine && <QuarantineDialog entries={quarantine} />}
    </>
  );
}
