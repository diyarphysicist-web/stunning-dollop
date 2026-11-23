import { ENGINE_RESTART_DELAYS_MS, EngineStatus, type EngineStatus as Status } from "@neuromr/contracts";
import { type MessageId, t } from "@neuromr/i18n";
import { useEffect, useState } from "react";
import { invoke } from "./bridge.js";
import { Icon } from "./Icon.js";

const UNAVAILABLE_HINT: Record<Extract<Status, { state: "unavailable" }>["reason"], MessageId> = {
  "not-installed": "engine.hint.notInstalled",
  "failed-to-start": "engine.hint.failedToStart",
  "crashed-repeatedly": "engine.hint.crashedRepeatedly",
};

/** Engine state from main: initial query plus pushed changes, each validated (GEN-221). */
export function useEngineStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    void invoke("engine:status", {}).then((r) => r.ok && setStatus(r.value));
    return window.neuromr.onEngineStatus((raw) => {
      const parsed = EngineStatus.safeParse(raw);
      if (parsed.success) setStatus(parsed.data);
    });
  }, []);
  return status;
}

/** Status-bar Engine item (GEN-221): state dot, state text and one actionable sentence. */
export function EngineStatusItem({ status }: { status: Status | null }) {
  if (!status) return null;
  const retry = () => void invoke("engine:retry", {});
  const label = (
    <>
      <Icon name="engine" />
      {t("engine.label")}
    </>
  );
  switch (status.state) {
    case "connected":
      return <span className="sb-item" data-engine-state="connected">{label}<span className="dot dot--success" /><b>{t("engine.connected")}</b>{` · ${t("engine.local")}`}</span>;
    case "starting":
      return <span className="sb-item" data-engine-state="starting">{label}<span className="dot dot--warning" /><b>{t("engine.starting")}</b>{` · ${t("engine.hint.waiting")}`}</span>;
    case "restarting":
      return (
        <span className="sb-item" data-engine-state="restarting">
          {label}<span className="dot dot--warning" />
          <b>{t("engine.restarting", { attempt: status.attempt, max: ENGINE_RESTART_DELAYS_MS.length })}</b>{` · ${t("engine.hint.waiting")}`}
        </span>
      );
    case "unavailable":
      return (
        <span className="sb-item" data-engine-state="unavailable">
          {label}<span className="dot dot--critical" /><b>{t("engine.unavailable")}</b>{` · ${t(UNAVAILABLE_HINT[status.reason])}`}
          {status.reason !== "not-installed" && <button className="link dense" onClick={retry}>{t("engine.retry")}</button>}
        </span>
      );
    case "stopped":
      return <span className="sb-item" data-engine-state="stopped">{label}<span className="dot dot--idle" /><b>{t("engine.stopped")}</b></span>;
  }
}
