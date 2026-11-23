import type { Types } from "@cornerstonejs/core";
import type { ViewerImageInfo } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { anchors, ellipseFromClicks, imageToWorld, moveAnchor, outline, translateShape, worldToImage, type Pt, type Roi, type RoiShape } from "@neuromr/viewer";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DRAW_TOOLS, useViewer, type Pane, type Tool } from "./store.js";

type StackViewport = Types.IStackViewport;

/** Image-space distance below which a freehand sample is skipped. */
const FREEHAND_STEP = 0.5;

interface Props {
  index: number;
  pane: Pane;
  tool: Tool;
  plane: ViewerImageInfo;
  viewport: () => StackViewport | null;
  /** Changes whenever the camera or image changes, so outlines are re-projected. */
  tick: number;
}

type Draft = { kind: "ellipse"; clicks: Pt[] } | { kind: "spline"; points: Pt[] } | { kind: "freehand"; points: Pt[] };

const roiStroke = (color: number) => ({ stroke: `var(--nm-roi-${(color % 8) + 1})` });
const roiFill = (color: number) => ({ fill: `var(--nm-roi-${(color % 8) + 1})` });

function draftShape(d: Draft, cursor: Pt | null): RoiShape | null {
  if (d.kind === "ellipse") {
    const [p1, p2] = d.clicks;
    if (!p1 || !cursor) return null;
    if (!p2) return ellipseFromClicks(p1, cursor, cursor);
    return ellipseFromClicks(p1, p2, cursor);
  }
  const pts = cursor && d.kind === "spline" ? [...d.points, cursor] : d.points;
  return d.kind === "spline" ? { kind: "spline", points: pts } : { kind: "freehand", points: pts };
}

/** ROIs of the shown slice drawn over the image (GEN-030…035), in image coordinates. */
export function RoiLayer({ index, pane, tool, plane, viewport, tick }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const drawing = DRAW_TOOLS.has(tool);
  const vp = viewport();
  void tick;

  const toCanvas = (p: Pt): Pt => {
    const c = vp?.worldToCanvas(imageToWorld(plane, p) as Types.Point3);
    return c ? [c[0], c[1]] : [0, 0];
  };
  const toImage = (clientX: number, clientY: number): Pt | null => {
    const rect = svg.current?.getBoundingClientRect();
    if (!vp || !rect) return null;
    const w = vp.canvasToWorld([clientX - rect.left, clientY - rect.top]);
    return worldToImage(plane, [w[0], w[1], w[2]]);
  };

  // Changing tool or slice abandons an unfinished ROI; Esc does too.
  useEffect(() => setDraft(null), [tool, pane.slice]);
  useEffect(() => {
    if (!draft && !menu && !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input")) return;
      if (e.key === "Escape") {
        setDraft(null);
        setMenu(null);
        setSelected(null);
      } else if (e.key === "Delete" && selected && useViewer.getState().active === index) {
        useViewer.getState().deleteRoi(index, selected);
        setSelected(null);
      }
    };
    const away = (e: PointerEvent) => {
      if (menu && !(e.target as HTMLElement | null)?.closest("[data-testid=roi-menu]")) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", away, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", away, true);
    };
  }, [draft, menu, selected, index]);

  const store = useViewer.getState;

  const onDrawDown = (e: ReactPointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    store().setActive(index);
    const p = toImage(e.clientX, e.clientY);
    if (!p) return;
    if (tool === "ellipse") {
      const clicks = draft?.kind === "ellipse" ? [...draft.clicks, p] : [p];
      if (clicks.length === 3) {
        const [p1, p2, p3] = clicks as [Pt, Pt, Pt];
        store().addRoi(index, ellipseFromClicks(p1, p2, p3));
        setDraft(null);
      } else setDraft({ kind: "ellipse", clicks });
    } else if (tool === "spline") {
      const points = draft?.kind === "spline" ? draft.points : [];
      if (e.detail >= 2 && points.length >= 3) {
        store().addRoi(index, { kind: "spline", points });
        setDraft(null);
      } else setDraft({ kind: "spline", points: [...points, p] });
    } else if (tool === "freehand") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraft({ kind: "freehand", points: [p] });
    }
  };

  const onDrawMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const p = toImage(e.clientX, e.clientY);
    setCursor(p);
    if (p && draft?.kind === "freehand" && e.buttons & 1) {
      const last = draft.points.at(-1) as Pt;
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= FREEHAND_STEP) setDraft({ kind: "freehand", points: [...draft.points, p] });
    }
  };

  const onDrawUp = () => {
    if (draft?.kind !== "freehand") return;
    if (draft.points.length >= 3) store().addRoi(index, { kind: "freehand", points: draft.points });
    setDraft(null);
  };

  /** Drag that edits an ROI: whole-ROI move from the outline, or one anchor (GEN-032). */
  const startEdit = (e: ReactPointerEvent<SVGElement>, roi: Roi, anchor: number | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    store().setActive(index);
    setSelected(roi.id);
    const start = toImage(e.clientX, e.clientY);
    if (!start) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let recorded = false;
    const original = roi.shape;
    const move = (ev: PointerEvent) => {
      const p = toImage(ev.clientX, ev.clientY);
      if (!p) return;
      if (!recorded) {
        store().checkpoint(index);
        recorded = true;
      }
      store().setRoiShape(index, roi.id, anchor === null ? translateShape(original, p[0] - start[0], p[1] - start[1]) : moveAnchor(original, anchor, p));
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

  const openMenu = (e: React.MouseEvent, roi: Roi) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = svg.current?.getBoundingClientRect();
    setMenu({ id: roi.id, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
  };

  const path = (pts: readonly Pt[], closed = true) => (pts.length ? `M${pts.map((p) => toCanvas(p).join(",")).join("L")}${closed ? "Z" : ""}` : "");
  const shown = vp ? pane.rois.filter((r) => r.slice === pane.slice) : [];
  const preview = draft ? draftShape(draft, cursor) : null;

  return (
    <>
      <svg ref={svg} className="roi-layer" data-testid={`roi-layer-${index}`} data-drawing={drawing || undefined}>
        {drawing && (
          <rect
            className="roi-layer__capture"
            width="100%"
            height="100%"
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
            onPointerLeave={() => setCursor(null)}
          />
        )}
        {shown.map((roi) => {
          const pts = outline(roi.shape);
          return (
            <g key={roi.id} data-roi={roi.name}>
              <path className="roi-path" style={roiStroke(roi.color)} d={path(pts)} />
              <path className="roi-hit" d={path(pts)} onPointerDown={(e) => startEdit(e, roi, null)} onContextMenu={(e) => openMenu(e, roi)} />
              {selected === roi.id &&
                anchors(roi.shape).map((a, k) => {
                  const c = toCanvas(a);
                  return <circle key={k} className="roi-anchor" style={roiFill(roi.color)} cx={c[0]} cy={c[1]} r="4" onPointerDown={(e) => startEdit(e, roi, k)} />;
                })}
            </g>
          );
        })}
        {preview && <path className="roi-path roi-path--draft" d={path(outline(preview), preview.kind !== "spline" || (draft?.kind === "spline" && draft.points.length >= 2))} />}
        {draft?.kind === "ellipse" && draft.clicks.length === 1 && cursor && <path className="roi-path roi-path--draft" d={path([draft.clicks[0] as Pt, cursor], false)} />}
      </svg>
      {shown.map((roi) => {
        const pts = outline(roi.shape).map(toCanvas);
        const top = pts.reduce((best, p) => (p[1] < best[1] ? p : best), pts[0] ?? [0, 0]);
        const style = { left: top[0], top: top[1] };
        return renaming === roi.id ? (
          <input
            key={roi.id}
            className="roi-label roi-label--edit"
            style={style}
            defaultValue={roi.name}
            aria-label={t("roi.rename")}
            autoFocus
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                store().renameRoi(index, roi.id, e.currentTarget.value);
                setRenaming(null);
              } else if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={(e) => {
              store().renameRoi(index, roi.id, e.currentTarget.value);
              setRenaming(null);
            }}
          />
        ) : (
          <span
            key={roi.id}
            className="roi-label"
            style={{ ...style, ...roiStroke(roi.color), color: `var(--nm-roi-${(roi.color % 8) + 1})` }}
            data-testid="roi-label"
            onDoubleClick={() => setRenaming(roi.id)}
            onContextMenu={(e) => openMenu(e, roi)}
          >
            {roi.name}
          </span>
        );
      })}
      {menu && (
        <div className="menu" role="menu" style={{ left: menu.x, top: menu.y }} data-testid="roi-menu" onPointerDown={(e) => e.stopPropagation()}>
          <button role="menuitem" className="menu__item" onClick={() => { setRenaming(menu.id); setMenu(null); }}><span>{t("roi.rename")}</span><span className="menu__key">{t("roi.renameHint")}</span><span /></button>
          <button role="menuitem" className="menu__item" onClick={() => { store().deleteRoi(index, menu.id); setMenu(null); }}><span>{t("roi.delete")}</span><span className="menu__key">{t("roi.deleteKey")}</span><span /></button>
        </div>
      )}
    </>
  );
}
