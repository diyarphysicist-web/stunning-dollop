import type { DicomAttribute } from "@neuromr/contracts";
import { formatQuantity, t, type MessageId } from "@neuromr/i18n";
import { softwareRendering } from "@neuromr/viewer/cornerstone";
import { useEffect, useRef, useState } from "react";
import { useDirectory } from "../directory/store.js";
import { Icon } from "../Icon.js";
import { activeStudy, useBookmarks } from "./bookmarks.js";
import { LAYOUTS, cellCount, layoutSize, type Layout } from "./stack.js";
import { paneRois, useViewer, type Tool } from "./store.js";
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
        <BookmarkSection />
      </div>
    </aside>
  );
}

/** GEN-244: confirmation before Reset all, naming the series and the ROIs it removes. */
function ResetAllDialog() {
  const pane = useViewer((s) => s.confirmReset);
  const description = useViewer((s) => (s.confirmReset === null ? "" : (s.panes[s.confirmReset]?.stack?.description ?? "")));
  const count = useViewer((s) => (s.confirmReset === null ? 0 : paneRois(s, s.confirmReset).rois.length));
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pane !== null) cancelRef.current?.focus();
  }, [pane]);
  if (pane === null) return null;
  const { askResetAll, resetAll } = useViewer.getState();
  return (
    <div className="scrim" onKeyDown={(e) => e.key === "Escape" && askResetAll(null)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-all-title" aria-describedby="reset-all-body" data-testid="reset-all-dialog">
        <div className="dialog__head"><span className="dialog__title" id="reset-all-title">{t("resetAll.title")}</span></div>
        <div className="dialog__body"><p id="reset-all-body">{t("resetAll.body", { series: description, n: count })}</p></div>
        <div className="dialog__foot">
          <button ref={cancelRef} className="btn btn--secondary" onClick={() => askResetAll(null)}>{t("resetAll.cancel")}</button>
          <button className="btn btn--destructive" data-testid="reset-all-confirm" onClick={() => resetAll(pane)}>{t("resetAll.confirm")}</button>
        </div>
      </div>
    </div>
  );
}

/** Bookmarks of the active study (GEN-242): save, restore with a click, rename or delete from the context menu. */
function BookmarkSection() {
  const study = useViewer((s) => {
    const uid = s.panes[s.active]?.seriesUid;
    return (uid && s.studyOfSeries[uid]) || null;
  });
  const list = useBookmarks((s) => s.list);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  useEffect(() => {
    void useBookmarks.getState().refresh(study);
  }, [study]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => !(e.target as HTMLElement | null)?.closest("[data-testid=bookmark-menu]") && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);
  if (!study) return null;
  const b = useBookmarks.getState();
  return (
    <div className="section bookmarks" data-testid="bookmarks">
      <div className="bookmarks__head">
        <span className="eyebrow">{t("bookmark.title")}</span>
        <button className="btn btn--secondary" title={t("bookmark.saveKey")} data-testid="bookmark-save" onClick={() => void b.save()}>
          {t("bookmark.save")}
        </button>
      </div>
      {list.length === 0 && <span className="t3 dense">{t("bookmark.empty")}</span>}
      <ul className="bookmarks__list">
        {list.map((bm) => (
          <li key={bm.id}>
            {renaming === bm.id ? (
              <input
                className="bookmarks__rename"
                aria-label={t("bookmark.renameLabel")}
                defaultValue={bm.name}
                autoFocus
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    void b.rename(bm.id, e.currentTarget.value);
                    setRenaming(null);
                  } else if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={(e) => {
                  void b.rename(bm.id, e.currentTarget.value);
                  setRenaming(null);
                }}
              />
            ) : (
              <button
                className="bookmarks__item"
                aria-label={t("bookmark.restore", { name: bm.name })}
                data-testid="bookmark"
                onClick={() => void b.restore(bm.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: bm.id, x: e.clientX, y: e.clientY });
                }}
              >
                <span className="strong">{bm.name}</span>
                <span className="t3 dense">{t("bookmark.savedAt", { at: new Date(bm.savedAt) })}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {menu && (
        <div className="menu menu--fixed" role="menu" style={{ left: menu.x, top: menu.y }} data-testid="bookmark-menu">
          <button role="menuitem" className="menu__item" onClick={() => { setRenaming(menu.id); setMenu(null); }}><span>{t("bookmark.rename")}</span><span /><span /></button>
          <button role="menuitem" className="menu__item" onClick={() => { void b.remove(menu.id); setMenu(null); }}><span>{t("bookmark.delete")}</span><span /><span /></button>
        </div>
      )}
    </div>
  );
}

const TOOLS: [Tool, string, MessageId][] = [
  ["scroll", "scroll", "viewer.tool.scroll"],
  ["pan", "pan", "viewer.tool.pan"],
  ["zoom", "zoom", "viewer.tool.zoom"],
  ["window", "wl", "viewer.tool.window"],
];

const DRAW: [Tool, string, MessageId][] = [
  ["ellipse", "ellipse", "viewer.tool.ellipse"],
  ["spline", "spline", "viewer.tool.spline"],
  ["freehand", "freehand", "viewer.tool.freehand"],
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
  const canUndo = useViewer((s) => paneRois(s, s.active).undo.length > 0);
  const canRedo = useViewer((s) => paneRois(s, s.active).redo.length > 0);
  const toolButton = ([id, icon, label]: [Tool, string, MessageId]) => (
    <button key={id} className={`ibtn${tool === id ? " is-active" : ""}`} aria-pressed={tool === id} aria-label={t(label)} title={t(label)} data-tool={id} onClick={() => useViewer.getState().setTool(id)}>
      <Icon name={icon} />
    </button>
  );
  return (
    <div className="toolbar" role="toolbar" aria-label={t("viewer.toolbar")}>
      {TOOLS.map(toolButton)}
      <span className="tb-sep" />
      {DRAW.map(toolButton)}
      <span className="tb-sep" />
      <button className="ibtn" aria-label={t("viewer.tool.reset")} title={t("viewer.tool.reset")} onClick={() => useViewer.getState().reset(active, "view")}><Icon name="reset" /></button>
      <span className="tb-sep" />
      <LayoutPicker />
      <span className="tb-sep" />
      <button className="ibtn" aria-label={t("viewer.undo")} title={t("viewer.undo")} disabled={!canUndo} onClick={() => useViewer.getState().undoRoi(active)}><Icon name="undo" /></button>
      <button className="ibtn" aria-label={t("viewer.redo")} title={t("viewer.redo")} disabled={!canRedo} onClick={() => useViewer.getState().redoRoi(active)}><Icon name="redo" /></button>
    </div>
  );
}

function attributeValue(a: DicomAttribute): string {
  const v = Array.isArray(a.value) ? a.value.map((x) => formatQuantity(x)).join(" \\ ") : typeof a.value === "number" ? formatQuantity(a.value) : a.value;
  if (!a.unit) return v;
  return a.unit === "deg" ? `${v}${t("unit.deg")}` : t("inspector.value", { value: v, unit: t(`unit.${a.unit}`) });
}

const q = (v: number) => formatQuantity(v, { decimals: Math.abs(v) >= 100 ? 1 : 2 });

/** ROI statistics of the active viewport's current image (GEN-236). */
function RoiSection() {
  const index = useViewer((s) => s.active);
  const pane = useViewer((s) => s.panes[s.active]);
  const rois = useViewer((s) => paneRois(s, s.active).rois);
  if (!pane?.stack) return null;
  const here = rois.filter((r) => r.slice === pane.slice);
  const elsewhere = rois.length - here.length;
  const info = pane.stack.images[0];
  const voxelArea = info?.pixelSpacing ? info.pixelSpacing[0] * info.pixelSpacing[1] : null;
  const unit = t("vp.unit");
  return (
    <div className="section" data-testid="roi-stats">
      <span className="eyebrow">{t("inspector.rois", { slice: pane.slice + 1 })}</span>
      {here.length === 0 && <span className="t3 dense">{t("inspector.roisEmpty")}</span>}
      <ul className="roi-list">
        {here.map((r) => {
          const st = pane.stats[r.id];
          return (
            <li key={r.id} data-roi={r.name}>
              <span className="roi-swatch" style={{ background: `var(--nm-roi-${(r.color % 8) + 1})` }} />
              <span className="roi-list__body">
                <span className="strong">{r.name}</span>
                {st && (
                  <>
                    <span className="dense" data-testid="roi-mean">{t("inspector.roi.mean", { mean: q(st.mean), sd: formatQuantity(st.sd, { decimals: Math.abs(st.mean) >= 100 ? 1 : 2 }), unit })}</span>
                    <span className="dense t2">{t("inspector.roi.range", { min: q(st.min), max: q(st.max), unit })}</span>
                    <span className="dense t2">{t("inspector.roi.size", { voxels: st.voxels, area: voxelArea === null ? "—" : formatQuantity(st.voxels * voxelArea, { decimals: 1 }) })}</span>
                  </>
                )}
              </span>
              <button className="ibtn ibtn--sm" aria-label={t("inspector.roi.delete", { name: r.name })} title={t("inspector.roi.delete", { name: r.name })} onClick={() => useViewer.getState().deleteRoi(index, r.id)}><Icon name="close" small /></button>
            </li>
          );
        })}
      </ul>
      {elsewhere > 0 && <span className="t3 dense">{t("inspector.roi.otherSlices", { n: elsewhere })}</span>}
    </div>
  );
}

/** DICOM inspector (GEN-233) for the active viewport's current image. */
function Inspector() {
  const attributes = useViewer((s) => s.attributes);
  const series = useViewer((s) => s.panes[s.active]?.stack?.description);
  return (
    <aside className="inspector" aria-label={t("inspector.label")}>
      <div className="inspector__head"><h2 className="panel__title">{t("inspector.title")}</h2></div>
      {series !== undefined && <RoiSection />}
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
      if (el?.closest("input, textarea, [role=menu], [role=dialog], [role=alertdialog]") || useViewer.getState().confirmReset !== null) return;
      const s = useViewer.getState();
      // GEN-034: undo and redo of ROI create, edit and delete.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        // GEN-242: Ctrl+Shift+B saves a bookmark of the active study.
        if (k === "b" && e.shiftKey) {
          if (activeStudy()) void useBookmarks.getState().save();
        } else if (k === "z" && !e.shiftKey) s.undoRoi(s.active);
        else if (k === "y" || (k === "z" && e.shiftKey)) s.redoRoi(s.active);
        else return;
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const pane = s.panes[s.active];
      const oneAxis = !pane?.stack || pane.stack.axis === "none" || (pane.stack.grid[0]?.length ?? 1) <= 1;
      const steps: Record<string, [number, number]> = oneAxis
        ? { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [-1, 0], ArrowDown: [1, 0] }
        : { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
      const step = steps[e.key];
      const tools: Record<string, Tool> = { s: "scroll", p: "pan", z: "zoom", w: "window", e: "ellipse", c: "spline", f: "freehand" };
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
      <ResetAllDialog />
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
