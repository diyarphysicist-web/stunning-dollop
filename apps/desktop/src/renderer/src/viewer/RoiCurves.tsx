import type { RoiCurves as Curves } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { invoke } from "../bridge.js";
import { Icon } from "../Icon.js";
import { averageCurve, curvesTsv, curveX, hasTimes, type XMode } from "./curves.js";
import { paneRois, useViewer } from "./store.js";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const roiColor = (color: number) => css(`--nm-roi-${(color % 8) + 1}`);

/** Writes text to the clipboard through main (GEN-246). */
export async function copyText(text: string): Promise<void> {
  await invoke("clipboard:write-text", { text });
}

function Check({ checked, onChange, children, testId }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className={`check curves__check${checked ? " is-checked" : ""}`} data-testid={testId} onClick={() => onChange(!checked)}>
      <span className="check__box"><Icon name="check" small /></span>
      {children}
    </button>
  );
}

/** ROI curves panel under the grid (GEN-245) for the active viewport's series; Ctrl+C copies it (GEN-246). */
export function RoiCurvesPanel() {
  const pane = useViewer((s) => s.panes[s.active]);
  const rois = useViewer((s) => paneRois(s, s.active).rois);
  const stack = pane?.stack ?? null;
  const [curves, setCurves] = useState<Curves | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [average, setAverage] = useState(false);
  const [autoscale, setAutoscale] = useState(true);
  const [mode, setMode] = useState<XMode>("time");
  const plotHost = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const lastRange = useRef<[number, number] | null>(null);
  const points = stack?.grid[0]?.length ?? 0;
  const shapesKey = JSON.stringify(rois.map((r) => [r.id, r.slice, r.shape]));

  // Curves are computed in main from the stored values (GEN-245), shortly after the ROIs settle.
  useEffect(() => {
    if (!stack || points < 2 || rois.length === 0) {
      setCurves(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void invoke("viewer:roi-curves", { seriesInstanceUid: stack.seriesInstanceUid, rois: rois.map((r) => ({ id: r.id, slice: r.slice, shape: r.shape as never })) }).then((r) => live && setCurves(r.ok ? r.value : []));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // shapesKey stands for the ROI list.
  }, [stack?.seriesInstanceUid, shapesKey, points]);

  const x = useMemo(() => (stack ? curveX(stack, mode) : { values: [], label: "" }), [stack, mode]);
  const shown = useMemo(() => {
    const list = rois
      .filter((r) => !hidden.has(r.id))
      .map((r) => ({ name: r.name, color: roiColor(r.color), values: curves?.find((c) => c.id === r.id)?.values ?? [] }));
    if (average && list.length > 1) list.push({ name: t("curves.average"), color: css("--nm-color-text-primary"), values: averageCurve(list.map((c) => c.values)) });
    return list;
  }, [rois, hidden, curves, average]);
  const unit = t("vp.unit");
  const current = pane?.point ?? 0;

  useEffect(() => {
    const host = plotHost.current;
    plot.current?.destroy();
    plot.current = null;
    if (!host || !curves || x.values.length === 0) return;
    const font = `${css("--nm-font-size-overlay")} ${css("--nm-font-ui")}`;
    const axis = { stroke: css("--nm-color-text-secondary"), grid: { stroke: css("--nm-color-border"), width: 1 }, ticks: { stroke: css("--nm-color-border-strong"), width: 1 }, font, labelFont: font };
    const fixed = !autoscale && lastRange.current;
    const opts: uPlot.Options = {
      width: host.clientWidth,
      height: host.clientHeight,
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: false }, y: fixed ? { auto: false, range: fixed } : { auto: true } },
      axes: [
        { ...axis, label: x.label },
        { ...axis, label: t("curves.y", { unit }) },
      ],
      series: [{}, ...shown.map((c, i): uPlot.Series => ({ label: c.name, stroke: c.color, width: 1.5, spanGaps: false, ...(average && i === shown.length - 1 && shown.length > 1 ? { dash: [5, 3] } : {}) }))],
      hooks: {
        draw: [
          (u) => {
            const y = u.scales.y;
            if (autoscale && y?.min !== undefined && y.max !== undefined) lastRange.current = [y.min, y.max];
            // GEN-102: vertical line at the current point.
            const xv = x.values[current];
            if (xv === undefined) return;
            const px = u.valToPos(xv, "x", true);
            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = css("--nm-color-text-secondary");
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, u.bbox.top);
            ctx.lineTo(px, u.bbox.top + u.bbox.height);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };
    const data: uPlot.AlignedData = [x.values, ...shown.map((c) => x.values.map((_, k) => c.values[k] ?? null))];
    plot.current = new uPlot(opts, data, host);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: host.clientWidth, height: host.clientHeight }));
    ro.observe(host);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [curves, shown, x, autoscale, current, unit, average]);

  const copy = () => void copyText(curvesTsv(x, shown, unit));
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      e.stopPropagation();
      copy();
    }
  };
  const message = !stack ? null : points < 2 ? t("curves.noAxis") : rois.length === 0 ? t("curves.noRois", { axis: stack.axis }) : !curves ? t("curves.loading") : null;
  return (
    <section className="curves" aria-label={t("curves.label")} tabIndex={0} onKeyDown={onKey} data-testid="roi-curves">
      <div className="curves__head">
        <span className="eyebrow">{t("curves.title", { series: stack?.description ?? "" })}</span>
        <span className="spacer" />
        {stack && hasTimes(stack) && (
          <div className="seg" role="radiogroup" aria-label={t("curves.xAxis")}>
            {(["time", "index"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={`seg__item${mode === m ? " is-selected" : ""}`} onClick={() => setMode(m)}>
                {t(m === "time" ? "curves.xSeconds" : "curves.xIndex")}
              </button>
            ))}
          </div>
        )}
        <Check checked={average} onChange={setAverage} testId="curves-average">{t("curves.average")}</Check>
        <Check checked={autoscale} onChange={setAutoscale}>{t("curves.autoscale")}</Check>
        <button className="btn btn--ghost btn--dense" data-testid="curves-copy" onClick={copy} disabled={!curves}>
          {t("curves.copy")} <span className="kbd">{t("curves.copyKey")}</span>
        </button>
        <button className="ibtn ibtn--sm" aria-label={t("curves.close")} title={t("curves.close")} onClick={() => useViewer.getState().toggleCurves()}><Icon name="close" small /></button>
      </div>
      <div className="curves__body">
        {message ? <div className="curves__message t2">{message}</div> : <div className="curves__plot" ref={plotHost} data-testid="curves-plot" />}
        {rois.length > 0 && points >= 2 && (
          <div className="curves__legend">
            {rois.map((r) => (
              <Check key={r.id} checked={!hidden.has(r.id)} onChange={(on) => setHidden((h) => { const n = new Set(h); if (on) n.delete(r.id); else n.add(r.id); return n; })}>
                <span className="legend__line" style={{ "--c": `var(--nm-roi-${(r.color % 8) + 1})` } as React.CSSProperties} />
                {r.name}
              </Check>
            ))}
            {average && shown.length > 1 && (
              <span className="check curves__check">
                <span className="legend__line legend__line--linked" style={{ "--c": "var(--nm-color-text-primary)" } as React.CSSProperties} />
                {t("curves.average")}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
