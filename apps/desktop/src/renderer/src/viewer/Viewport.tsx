import { Enums, type Types } from "@cornerstonejs/core";
import type { ViewerStack } from "@neuromr/contracts";
import { formatQuantity, t } from "@neuromr/i18n";
import { dragWindow, initialWindow, markersFromScreenAxes, roiMask, roiStats, type Markers, type RoiShape, type RoiStats, type Vec3, type VoiRange } from "@neuromr/viewer";
import { ImageUnavailable, imageId, renderingEngine } from "@neuromr/viewer/cornerstone";
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../Icon.js";
import { RoiLayer } from "./RoiLayer.js";
import { DRAW_TOOLS, currentSop, paneRois, useViewer, type Pane } from "./store.js";
import { flatten, scrollStep } from "./stack.js";

type StackViewport = Types.IStackViewport;
type Problem = "unsupported" | "missing" | "failed";

/** Pixels of drag per scroll step (GEN-020, GEN-021). */
const SCROLL_PX = 8;

interface View {
  zoom: number;
  voi: VoiRange | null;
  markers: Markers | null;
}

/** Voxel masks per ROI outline and image size; shapes are immutable, so the object is the key. */
const masks = new WeakMap<RoiShape, { key: string; mask: Uint32Array }>();
function maskOf(shape: RoiShape, width: number, height: number): Uint32Array {
  const key = `${width}x${height}`;
  const hit = masks.get(shape);
  if (hit?.key === key) return hit.mask;
  const mask = roiMask(shape, width, height);
  masks.set(shape, { key, mask });
  return mask;
}

const sub = (a: Types.Point3, b: Types.Point3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Orientation markers from what is actually on screen (SAFE-040): the canvas axes in patient space. */
function screenMarkers(vp: StackViewport): Markers | null {
  const { width, height } = vp.canvas;
  if (!width || !height) return null;
  const o = vp.canvasToWorld([width / 2, height / 2]);
  const right = sub(vp.canvasToWorld([width / 2 + 1, height / 2]), o);
  const down = sub(vp.canvasToWorld([width / 2, height / 2 + 1]), o);
  if (Math.hypot(...right) === 0 || Math.hypot(...down) === 0) return null;
  return markersFromScreenAxes(right, down);
}

function readView(vp: StackViewport): View {
  return { zoom: vp.getZoom(), voi: vp.getProperties().voiRange ?? null, markers: screenMarkers(vp) };
}

/** The series' initial window from the image now shown (GEN-232). */
function startWindow(vp: StackViewport, stack: ViewerStack, sop: string | null): VoiRange | null {
  const image = vp.getCornerstoneImage();
  if (!image) return null;
  const info = stack.images.find((i) => i.ref === sop);
  return initialWindow(image.getPixelData(), info?.windowCenter ?? null, info?.windowWidth ?? null);
}

function positionText(stack: ViewerStack, pane: Pane): string {
  const parts = [stack.description];
  const points = stack.grid[0]?.length ?? 1;
  if (stack.axis !== "none" && points > 1) parts.push(t("vp.pos.point", { axis: stack.axis, n: pane.point + 1, total: points }));
  const b = stack.points[pane.point]?.bValue;
  if (stack.axis === "volume" && b !== undefined) parts.push(t("vp.pos.b", { b }));
  parts.push(t("vp.pos.slice", { slice: pane.slice + 1, slices: stack.grid.length }));
  return parts.join(t("punct.dotSpaced"));
}

function timingText(stack: ViewerStack, sop: string | null, pane: Pane): string {
  const info = stack.images.find((i) => i.ref === sop);
  const parts: string[] = [];
  const time = stack.points[pane.point]?.timeS;
  if (stack.axis === "dynamic" && time !== undefined) parts.push(t("vp.time", { t: formatQuantity(time, { decimals: 1 }) }));
  if (info?.repetitionTime != null) parts.push(t("vp.tr", { tr: formatQuantity(info.repetitionTime / 1000, { decimals: info.repetitionTime < 100 ? 3 : 1 }) }));
  if (info?.echoTime != null) parts.push(t("vp.te", { te: info.echoTime }));
  return parts.join(t("punct.dotSpaced"));
}

function ViewportMenu({ index, at, onClose }: { index: number; at: { x: number; y: number }; onClose: () => void }) {
  const { transform, reset } = useViewer.getState();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  useEffect(() => {
    // GEN-006: the menu stays inside its viewport, opening left of or above the pointer when needed.
    const menu = ref.current;
    const host = menu?.offsetParent as HTMLElement | null;
    if (!menu || !host) return;
    const x = at.x + menu.offsetWidth > host.clientWidth ? Math.max(0, at.x - menu.offsetWidth) : at.x;
    const y = at.y + menu.offsetHeight > host.clientHeight ? Math.max(0, at.y - menu.offsetHeight) : at.y;
    setPos({ x, y });
    menu.querySelector("button")?.focus();
    const away = (e: PointerEvent) => !menu.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [at, onClose]);
  const items: [label: Parameters<typeof t>[0], key: Parameters<typeof t>[0] | null, run: () => void][] = [
    ["vp.menu.mirror", "vp.key.mirror", () => transform(index, "mirror")],
    ["vp.menu.flip", "vp.key.flip", () => transform(index, "flip")],
    ["vp.menu.rotateCw", "vp.key.rotateCw", () => transform(index, "rotate-cw")],
    ["vp.menu.rotateCcw", "vp.key.rotateCcw", () => transform(index, "rotate-ccw")],
    ["vp.menu.resetView", "vp.key.resetView", () => reset(index, "view")],
    ["vp.menu.resetWindow", null, () => reset(index, "window")],
    ["vp.menu.deleteLastRoi", "vp.key.undo", () => useViewer.getState().deleteLastRoi(index)],
  ];
  return (
    <div ref={ref} className="menu" role="menu" data-testid="viewport-menu" style={{ left: pos.x, top: pos.y }} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      {items.map(([label, key, run], i) => (
        <Fragment key={label}>
          {(i === 4 || i === 6) && <div className="menu__sep" role="separator" />}
          <button
            role="menuitem"
            className="menu__item"
            onClick={() => {
              run();
              onClose();
            }}
          >
            <span>{t(label)}</span>
            <span className="menu__key">{key ? t(key) : ""}</span>
            <span />
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** One viewport of the generic Viewer (GEN-230, GEN-231). */
export function Viewport({ index }: { index: number }) {
  const pane = useViewer((s) => s.panes[index]) as Pane;
  const isActive = useViewer((s) => s.active === index);
  const tool = useViewer((s) => s.tool);
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLDivElement>(null);
  const viewportId = `vp-${index}`;
  const [view, setView] = useState<View>({ zoom: 1, voi: null, markers: null });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [syntax, setSyntax] = useState("");
  const report = (err: unknown) => {
    setProblem(err instanceof ImageUnavailable ? err.reason : "failed");
    setSyntax(err instanceof ImageUnavailable ? err.transferSyntaxUid : "");
  };
  const [shownStack, setShownStack] = useState<ViewerStack | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);
  const firstWindow = useRef<VoiRange | null>(null);
  /** True once the series' saved camera has been applied, so later camera events are its own (GEN-241). */
  const tracking = useRef(false);
  const stack = pane.stack;
  const flat = useMemo(() => (stack ? flatten(stack) : null), [stack]);
  const sop = currentSop(pane);

  const viewport = (): StackViewport | null => {
    try {
      return renderingEngine().getViewport<StackViewport>(viewportId) ?? null;
    } catch {
      return null;
    }
  };

  // Enable the element once; Cornerstone renders into it until unmount.
  useEffect(() => {
    const el = element.current;
    if (!el) return;
    const engine = renderingEngine();
    engine.enableElement({ viewportId, type: Enums.ViewportType.STACK, element: el, defaultOptions: { background: [0, 0, 0] } });
    const update = () => {
      const vp = engine.getViewport<StackViewport>(viewportId);
      if (vp) setView(readView(vp));
      setTick((n) => n + 1);
    };
    // GEN-241: zoom, pan and window are part of the series' saved state.
    const note = () => {
      update();
      const vp = engine.getViewport<StackViewport>(viewportId);
      if (!vp || !tracking.current) return;
      const voi = vp.getProperties().voiRange;
      const pan = vp.getPan();
      useViewer.getState().noteCamera(index, {
        zoom: vp.getZoom(),
        pan: [pan[0], pan[1]],
        window: voi ? { lower: voi.lower, upper: voi.upper } : null,
      });
    };
    el.addEventListener(Enums.Events.CAMERA_MODIFIED, note);
    el.addEventListener(Enums.Events.VOI_MODIFIED, note);
    el.addEventListener(Enums.Events.IMAGE_RENDERED, update);
    const resize = new ResizeObserver(() => engine.resize(true, true));
    resize.observe(el);
    return () => {
      resize.disconnect();
      el.removeEventListener(Enums.Events.CAMERA_MODIFIED, note);
      el.removeEventListener(Enums.Events.VOI_MODIFIED, note);
      el.removeEventListener(Enums.Events.IMAGE_RENDERED, update);
      engine.disableElement(viewportId);
    };
  }, [viewportId]);

  // A new series: give the viewport its images, show the current one, set the initial window.
  useEffect(() => {
    const vp = viewport();
    setProblem(null);
    setShownStack(null);
    tracking.current = false;
    if (!vp || !stack || !flat) return;
    let live = true;
    const start = sop ? (flat.index.get(sop) ?? 0) : 0;
    vp.setStack(flat.ids.map(imageId), start)
      .then(() => {
        if (!live) return;
        firstWindow.current = startWindow(vp, stack, sop);
        if (firstWindow.current) vp.setProperties({ voiRange: firstWindow.current });
        vp.resetCamera();
        // GEN-241: the series comes back with the zoom, pan and window it was left with.
        const saved = useViewer.getState().panes[index]?.restore;
        if (saved?.window) vp.setProperties({ voiRange: saved.window });
        if (saved?.zoom) vp.setZoom(saved.zoom);
        if (saved?.pan) vp.setPan(saved.pan);
        tracking.current = true;
        vp.render();
        setShownStack(stack);
        setView(readView(vp));
      })
      .catch((err: unknown) => live && report(err));
    return () => {
      live = false;
    };
    // The current image is applied by the effect below; this one runs once per series.
  }, [stack, flat]);

  // Slice and second-axis position (GEN-020, GEN-021).
  useEffect(() => {
    const vp = viewport();
    if (!vp || !flat || shownStack !== stack || !sop) return;
    const at = flat.index.get(sop);
    if (at === undefined || at === vp.getCurrentImageIdIndex()) return;
    setProblem(null);
    vp.setImageIdIndex(at).catch(report);
  }, [sop, shownStack]);

  // Viewing tools (GEN-130); the markers are re-read from the camera afterwards.
  useEffect(() => {
    const vp = viewport();
    if (!vp || shownStack !== stack) return;
    // setCamera flips only when the state differs; setViewPresentation cannot un-flip in Cornerstone 5.
    vp.setCamera({ flipHorizontal: pane.transform.mirror, flipVertical: pane.transform.flip });
    vp.setViewPresentation({ rotation: pane.transform.quarterTurns * 90 });
    vp.render();
    setView(readView(vp));
  }, [pane.transform, shownStack]);

  // Resets (GEN-012).
  useEffect(() => {
    const vp = viewport();
    if (!vp || pane.resetView === 0) return;
    vp.resetCamera();
    vp.render();
  }, [pane.resetView]);
  useEffect(() => {
    const vp = viewport();
    if (!vp || pane.resetWindow === 0 || !firstWindow.current) return;
    vp.setProperties({ voiRange: firstWindow.current });
    vp.render();
  }, [pane.resetWindow]);

  // GEN-236: statistics of the current image inside each ROI of this slice.
  const rois = useViewer((s) => paneRois(s, index).rois);
  useEffect(() => {
    const vp = viewport();
    const image = vp?.getCornerstoneImage();
    if (!vp || !image || !sop || image.imageId !== imageId(sop)) return;
    const values = image.getPixelData();
    const stats: Record<string, RoiStats | null> = {};
    for (const r of rois) if (r.slice === pane.slice) stats[r.id] = roiStats(values, maskOf(r.shape, image.width, image.height));
    useViewer.getState().setStats(index, stats);
    // tick follows IMAGE_RENDERED, so the stats switch with the image actually shown.
  }, [rois, sop, tick]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    useViewer.getState().setActive(index);
    if (e.button === 2 || !stack || (e.button === 0 && DRAW_TOOLS.has(useViewer.getState().tool))) return;
    const vp = viewport();
    if (!vp) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const tool = e.button === 1 ? "pan" : useViewer.getState().tool;
    const rect = target.getBoundingClientRect();
    let last = { x: e.clientX, y: e.clientY };
    let carry = { x: 0, y: 0 };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      if (tool === "scroll") {
        carry = { x: carry.x + dx, y: carry.y + dy };
        const sx = Math.trunc(carry.x / SCROLL_PX);
        const sy = Math.trunc(carry.y / SCROLL_PX);
        if (sx || sy) {
          carry = { x: carry.x - sx * SCROLL_PX, y: carry.y - sy * SCROLL_PX };
          const { dSlice, dPoint } = scrollStep(stack, sx, sy);
          useViewer.getState().step(index, dSlice, dPoint);
        }
      } else if (tool === "pan") {
        const a = vp.canvasToWorld([last.x - rect.left, last.y - rect.top]);
        const b = vp.canvasToWorld([ev.clientX - rect.left, ev.clientY - rect.top]);
        const d = sub(b, a);
        const cam = vp.getCamera();
        if (cam.focalPoint && cam.position)
          vp.setCamera({
            focalPoint: [cam.focalPoint[0] - d[0], cam.focalPoint[1] - d[1], cam.focalPoint[2] - d[2]],
            position: [cam.position[0] - d[0], cam.position[1] - d[1], cam.position[2] - d[2]],
          });
        vp.render();
      } else if (tool === "zoom") {
        vp.setZoom(vp.getZoom() * Math.exp(-dy * 0.01));
        vp.render();
      } else {
        const voi = vp.getProperties().voiRange;
        if (voi) {
          vp.setProperties({ voiRange: dragWindow(voi, dx, dy) });
          vp.render();
        }
      }
      last = { x: ev.clientX, y: ev.clientY };
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  // GEN-023: wheel and two-finger scroll change slice; pinch (Ctrl+wheel) zooms.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewport();
      if (e.ctrlKey && vp) {
        vp.setZoom(vp.getZoom() * Math.exp(-e.deltaY * 0.01));
        vp.render();
      } else if (Math.abs(e.deltaY) >= 1) useViewer.getState().step(index, Math.sign(e.deltaY), 0);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [index]);

  const info = stack?.images.find((i) => i.ref === sop);
  const points = stack?.grid[0]?.length ?? 1;
  const label = stack ? t("vp.label", { n: index + 1, series: stack.description }) : t("vp.labelEmpty", { n: index + 1 });
  const ready = shownStack !== null && shownStack === stack && !problem;
  const voi = view.voi;
  return (
    <section className={`vp${isActive ? " is-active" : ""}`} aria-label={label} data-testid={`viewport-${index}`} data-state={problem ?? (ready ? "ready" : pane.status)}>
      <div className="vp__head">
        <span className="vp__role">{t("number.count", { n: index + 1 })}</span>
        {stack && <span className="vp__series">{stack.description}</span>}
        {stack && stack.axis !== "none" && points > 1 && (
          <span className="stepper">
            <button className="ibtn ibtn--sm" aria-label={t("vp.prev", { axis: stack.axis })} title={t("vp.prev", { axis: stack.axis })} onClick={() => useViewer.getState().step(index, 0, -1)}><Icon name="chev-left" small /></button>
            {t("vp.point", { axis: stack.axis, n: pane.point + 1, total: points })}
            <button className="ibtn ibtn--sm" aria-label={t("vp.next", { axis: stack.axis })} title={t("vp.next", { axis: stack.axis })} onClick={() => useViewer.getState().step(index, 0, 1)}><Icon name="chev-right" small /></button>
          </span>
        )}
        <span className="spacer" />
        {stack && (
          <button className="ibtn ibtn--sm" aria-label={t("vp.menu")} title={t("vp.menu")} aria-haspopup="menu" onClick={(e) => {
            const r = host.current?.getBoundingClientRect();
            const b = e.currentTarget.getBoundingClientRect();
            setMenu({ x: b.left - (r?.left ?? 0), y: b.bottom - (r?.top ?? 0) });
          }}><Icon name="more" small /></button>
        )}
      </div>
      <div
        className="vp__body"
        ref={host}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!stack) return;
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onKeyDown={(e) => {
          if (stack && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
            e.preventDefault();
            setMenu({ x: 0, y: 0 });
          }
        }}
      >
        <div className="vp__canvas" ref={element} onPointerDown={onPointerDown} data-tool={tool} />
        {!stack && pane.status === "empty" && <div className="vp__notice t2">{t("vp.empty")}</div>}
        {pane.status === "loading" && <div className="vp__notice t2">{t("vp.loading")}</div>}
        {(pane.status === "failed" || problem) && (
          <div className="vp__notice"><div className="notice notice--warning" role="status"><Icon name="warn" /><span className="notice__text">{problem === "unsupported" ? t("vp.unsupported", { syntax }) : t(problem === "missing" ? "vp.missing" : "vp.failed")}</span></div></div>
        )}
        {stack && ready && (
          <>
            <div className="ov ov--tl" data-testid="overlay-position">
              {positionText(stack, pane)}
              <br />
              <span className="t2">{timingText(stack, sop, pane)}</span>
              {info?.lossy && (
                <>
                  <br />
                  <span className="ov__warn" data-testid="overlay-lossy">{t("vp.lossy")}</span>
                </>
              )}
            </div>
            <div className="ov ov--tr">{stack.patientName}<br /><span className="t2">{[stack.patientId, stack.studyDate].filter(Boolean).join(t("punct.dotSpaced"))}</span></div>
            {voi && <div className="ov ov--bl" data-testid="overlay-window">{t("vp.window", { w: formatQuantity(voi.upper - voi.lower, { decimals: 1 }), l: formatQuantity((voi.upper + voi.lower) / 2, { decimals: 1 }) })} <span className="t2">{t("vp.unit")}</span></div>}
            <div className="ov ov--br">
              {t("vp.zoom", { z: Math.round(view.zoom * 100) })}
              <br />
              <span className="t2">
                {info?.pixelSpacing ? t("vp.spacing", { row: formatQuantity(info.pixelSpacing[0], { decimals: 1 }), column: formatQuantity(info.pixelSpacing[1], { decimals: 1 }) }) + t("punct.dotSpaced") : ""}
                {info ? t("dims.matrix", { columns: info.columns, rows: info.rows }) : ""}
              </span>
            </div>
            {view.markers && (
              <>
                <span className="ov orient orient--n" data-testid="orient-n">{view.markers.top}</span>
                <span className="ov orient orient--s" data-testid="orient-s">{view.markers.bottom}</span>
                <span className="ov orient orient--w" data-testid="orient-w">{view.markers.left}</span>
                <span className="ov orient orient--e" data-testid="orient-e">{view.markers.right}</span>
              </>
            )}
          </>
        )}
        {stack && ready && info && <RoiLayer index={index} pane={pane} tool={tool} plane={info} viewport={viewport} tick={tick} />}
        {menu && <ViewportMenu index={index} at={menu} onClose={() => setMenu(null)} />}
      </div>
    </section>
  );
}
