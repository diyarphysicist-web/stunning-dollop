import type { AppInfo, WindowState } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { useEffect, useState } from "react";
import { invoke } from "./bridge.js";
import { Icon, IconSprite } from "./Icon.js";

function TopBar({ maximized }: { maximized: boolean }) {
  const control = (action: "minimize" | "toggle-maximize" | "close") => void invoke("window:control", { action });
  return (
    <header className="topbar">
      <div className="brand"><Icon name="brand" className="brand__mark" />{t("app.name")}</div>
      <div className="banner" aria-label={t("banner.label")}><span className="t2">{t("banner.noPatient")}</span></div>
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

function Rail() {
  return (
    <nav className="rail" aria-label={t("rail.label")}>
      <button className="rail__item is-active" aria-current="page" aria-label={t("rail.directory.hint")}><Icon name="directory" />{t("rail.directory")}</button>
    </nav>
  );
}

function StatusBar({ info, failed }: { info: AppInfo | null; failed: boolean }) {
  return (
    <footer className="statusbar">
      <span className="sb-item"><span className="dot dot--idle" /><b>{t("status.noStudy")}</b></span>
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

  useEffect(() => {
    void invoke("app:info", {}).then((r) => (r.ok ? setInfo(r.value) : setFailed(true)));
    void invoke("window:control", { action: "query" }).then((r) => r.ok && setWin(r.value));
    return window.neuromr.onWindowState(setWin);
  }, []);

  return (
    <div className="app app--no-inspector">
      <IconSprite />
      <TopBar maximized={win.maximized} />
      <Rail />
      <StatusBar info={info} failed={failed} />
    </div>
  );
}
