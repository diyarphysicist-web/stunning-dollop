import type { DicomAttribute } from "@neuromr/contracts";
import { formatQuantity, t, type MessageId } from "@neuromr/i18n";
import { softwareRendering } from "@neuromr/viewer/cornerstone";
import { useEffect, useRef, useState } from "react";
import { useDirectory } from "../directory/store.js";
import { Icon } from "../Icon.js";
import { LAYOUTS, cellCount, layoutSize, type Layout } from "./stack.js";
import { useViewer, type Tool } from "./store.js";
import { Viewport } from "./Viewport.js";

const DECORATIVE = "";

/** Series tab (GEN-002, GEN-230): the open study's series; a click shows one in the active viewport. */
function SeriesPanel() {
  const series = useDirectory((s) => s.series);
  const panes = useViewer((s) => s.panes);
  const layout = useViewer((s) => s.layout);
  const shown = new Map<string, number>();
  panes.slice(0, cellCount(layout)).forEach((p, i) => p.seriesUid && !shown.has(p.seriesUid) && shown.set(p.seriesUid, i + 1));
  return (
    <aside className="panel" aria-label={t("viewer.panel.label")}>
      <div className="panel__head">
        <div className="panel__head-row"><h1 className="panel__title">{t("viewer.panel")}</h1></div>
        <span className="t3 dense">{series.length ? t("viewer.panel.hint") : t("viewer.panel.noStudy")}</span>
      </div>
      <div className="panel__body">
        <ul className="vseries" data-testid="viewer-series">
          {series.map((s) => {
            const where = shown.get(s.seriesInstanceUid);
            return (
              <li key={s.seriesInstanceUid}>
                <button className={`vseries__item${where ? " is-shown" : ""}`} onClick={() => void useViewer.getState().load(useViewer.getState().active, s.seriesInstanceUid)}>
                  <span className="thumb">{s.thumbnail && <img src={s.thumbnail} alt={DECORATIVE} />}</span>
                  <span className="vseries__text">
                    <span className="strong">{s.description}</span>
                    <span className="t3 dense">{where ? t("viewer.panel.shownIn", { n: where }) : t("number.count", { n: s.imageCount })}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

const TOOLS: [Tool, string, MessageId][] = [
  ["scroll", "scroll", "viewer.tool.scroll"],
  ["pan", "pan", "viewer.tool.pan"],
  ["zoom", "zoom", "viewer.tool.zoom"],
  ["window", "wl", "viewer.tool.window"],
];

const layoutName = (l: Layout) => t("viewer.layout.name", layoutSize(l));

function LayoutPicker() {
  const layout = useViewer((s) => s.layout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [open]);
  return (
    <div className="layout-picker" ref={ref}>
      <button className="picker" aria-label={t("viewer.layout", { layout: layoutName(layout) })} title={t("viewer.layout", { layout: layoutName(layout) })} aria-haspopup="menu" aria-expanded={open} data-testid="layout-picker" onClick={() => setOpen(!open)}>
        <Icon name="layout" />
        {layoutName(layout)}
        <Icon name="chev-down" small />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={t("viewer.layout.menu")} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          {LAYOUTS.map((l) => (
            <button key={l} role="menuitemradio" aria-checked={l === layout} className="menu__item" onClick={() => { useViewer.getState().setLayout(l); setOpen(false); }}>
              <span>{layoutName(l)}</span>
              <span />
              {l === layout ? <Icon name="check" small /> : <span />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toolbar() {
  const tool = useViewer((s) => s.tool);
  const active = useViewer((s) => s.active);
  return (
    <div className="toolbar" role="toolbar" aria-label={t("viewer.toolbar")}>
      {TOOLS.map(([id, icon, label]) => (
        <button key={id} className={`ibtn${tool === id ? " is-active" : ""}`} aria-pressed={tool === id} aria-label={t(label)} title={t(label)} data-tool={id} onClick={() => useViewer.getState().setTool(id)}>
          <Icon name={icon} />
        </button>
      ))}
      <span className="tb-sep" />
      <button className="ibtn" aria-label={t("viewer.tool.reset")} title={t("viewer.tool.reset")} onClick={() => useViewer.getState().reset(active, "view")}><Icon name="reset" /></button>
      <span className="tb-sep" />
      <LayoutPicker />
    </div>
  );
}

function attributeValue(a: DicomAttribute): string {
  const v = Array.isArray(a.value) ? a.value.map((x) => formatQuantity(x)).join(" \\ ") : typeof a.value === "number" ? formatQuantity(a.value) : a.value;
  if (!a.unit) return v;
  return a.unit === "deg" ? `${v}${t("unit.deg")}` : t("inspector.value", { value: v, unit: t(`unit.${a.unit}`) });
}

/** DICOM inspector (GEN-233) for the active viewport's current image. */
function Inspector() {
  const attributes = useViewer((s) => s.attributes);
  const series = useViewer((s) => s.panes[s.active]?.stack?.description);
  return (
    <aside className="inspector" aria-label={t("inspector.label")}>
      <div className="inspector__head"><h2 className="panel__title">{t("inspector.title")}</h2></div>
      <div className="section">
        {series === undefined ? (
          <span className="t3 dense">{t("inspector.empty")}</span>
        ) : (
          <>
            <span className="eyebrow">{t("inspector.dicom", { series })}</span>
            <ul className="tags" data-testid="dicom-tags">
              {attributes.map((a) => (
                <li key={a.tag}><span className="tag">{a.tag}</span><span className="name">{a.keyword}</span><span className="val">{attributeValue(a)}</span></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

const GRID_STYLE = (l: Layout) => {
  const { rows, columns } = layoutSize(l);
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` };
};

/** Keys of the generic Viewer (GEN-020/021 arrows, tool letters, viewing tools). */
function useViewerKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || el?.closest("input, textarea, [role=menu]")) return;
      const s = useViewer.getState();
      const pane = s.panes[s.active];
      const oneAxis = !pane?.stack || pane.stack.axis === "none" || (pane.stack.grid[0]?.length ?? 1) <= 1;
      const steps: Record<string, [number, number]> = oneAxis
        ? { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [-1, 0], ArrowDown: [1, 0] }
        : { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
      const step = steps[e.key];
      const tools: Record<string, Tool> = { s: "scroll", p: "pan", z: "zoom", w: "window" };
      const views: Record<string, () => void> = {
        h: () => s.transform(s.active, "mirror"),
        v: () => s.transform(s.active, "flip"),
        "]": () => s.transform(s.active, "rotate-cw"),
        "[": () => s.transform(s.active, "rotate-ccw"),
        r: () => s.reset(s.active, "view"),
      };
      const key = e.key.toLowerCase();
      if (step) s.step(s.active, step[0], step[1]);
      else if (tools[key]) s.setTool(tools[key]);
      else if (views[key]) views[key]();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The Viewer activity (GEN-230): Series tab, toolbar, viewport grid and DICOM inspector. */
export function Viewer() {
  const layout = useViewer((s) => s.layout);
  useViewerKeys();
  return (
    <>
      <SeriesPanel />
      <Toolbar />
      <main className="vgrid" aria-label={t("viewer.grid")} style={GRID_STYLE(layout)} data-layout={layout}>
        {Array.from({ length: cellCount(layout) }, (_, i) => <Viewport key={i} index={i} />)}
      </main>
      <Inspector />
    </>
  );
}

/** GEN-235: the status bar says when images are drawn without the GPU. */
export function RenderingStatusItem() {
  const shown = useViewer((s) => s.panes.some((p) => p.stack !== null));
  if (!shown || !softwareRendering()) return null;
  return (
    <>
      <span className="sb-item" data-testid="software-rendering"><span className="dot dot--warning" /><b>{t("status.software")}</b>{t("punct.dotSpaced")}{t("status.softwareDetail")}</span>
      <span className="sb-sep" />
    </>
  );
}
