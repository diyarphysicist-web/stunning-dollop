import type { LayoutPreset, PresetCell } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../Icon.js";
import { activeUserPreset, SYSTEM_KEYS, usePresets, type PresetKey } from "./presets.js";
import { cellCount, layoutSize, type Layout } from "./stack.js";
import { useViewer } from "./store.js";

export const layoutName = (l: Layout) => t("viewer.layout.name", layoutSize(l));

/** "DSC · DSC perf" for a preset cell (GEN-243). */
export function cellLabel(c: PresetCell | null): string {
  if (!c) return t("presets.cellEmpty");
  return c.type ? t("presets.cell", { type: t(`seriesType.${c.type}`), description: c.description }) : c.description;
}

function MiniGrid({ layout, labels, big }: { layout: Layout; labels?: string[]; big?: boolean }) {
  const { rows, columns } = layoutSize(layout);
  return (
    <div className={`mini-grid${big ? " mini-grid--big" : ""}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {Array.from({ length: cellCount(layout) }, (_, i) => (
        <span key={i}>{labels?.[i] ?? ""}</span>
      ))}
    </div>
  );
}

/** Layout presets dialog (GEN-243, screen 17). */
export function PresetDialog() {
  const open = usePresets((s) => s.open);
  const list = usePresets((s) => s.list);
  const selected = usePresets((s) => s.selected);
  const naming = usePresets((s) => s.naming);
  const activeId = usePresets((s) => activeUserPreset(s));
  const layout = useViewer((s) => s.layout);
  const [renaming, setRenaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && !naming) listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus();
  }, [open, naming]);
  useEffect(() => setRenaming(false), [selected]);
  useEffect(() => {
    if (!open) return;
    // Escape closes even when focus has fallen to the page (e.g. after deleting the selected preset).
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement | null)?.closest("input") && usePresets.getState().close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;
  const p = usePresets.getState();
  const keys: PresetKey[] = [...SYSTEM_KEYS, ...list.map((x) => `user:${x.id}` as const)];
  const user: LayoutPreset | undefined = selected.startsWith("user:") ? list.find((x) => `user:${x.id}` === selected) : undefined;
  const shownLayout: Layout = user ? user.layout : (selected.slice("system:".length) as Layout);
  const isActive = user ? user.id === activeId : activeId === null && shownLayout === layout;
  const name = (k: PresetKey) => {
    const u = list.find((x) => `user:${x.id}` === k);
    return u ? u.name : layoutName(k.slice("system:".length) as Layout);
  };
  const kind = (k: PresetKey) => {
    const u = k.startsWith("user:");
    const active = u ? Number(k.slice(5)) === activeId : activeId === null && k === `system:${layout}`;
    return t(u ? (active ? "presets.userActive" : "presets.user") : active ? "presets.systemActive" : "presets.system");
  };
  const labels = Array.from({ length: cellCount(shownLayout) }, (_, i) =>
    user ? t("presets.cellNumbered", { n: i + 1, label: cellLabel(user.cells[i] ?? null) }) : t("presets.viewport", { n: i + 1 }),
  );
  const onListKey = (e: KeyboardEvent) => {
    const at = keys.indexOf(selected);
    const next = e.key === "ArrowDown" ? keys[at + 1] : e.key === "ArrowUp" ? keys[at - 1] : undefined;
    if (next) {
      e.preventDefault();
      p.select(next);
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus());
    }
  };
  const onDialogKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && !(e.target as HTMLElement).closest("input, button")) void p.apply(selected);
  };
  return (
    <div className="scrim" onKeyDown={onDialogKey}>
      <div className="dialog dialog--xl" role="dialog" aria-modal="true" aria-labelledby="lp-title" data-testid="preset-dialog">
        <div className="dialog__head">
          <h2 className="dialog__title" id="lp-title">{t("presets.title")}</h2>
          <button className="ibtn" aria-label={t("presets.closeKey")} title={t("presets.closeKey")} onClick={p.close}><Icon name="close" /></button>
        </div>
        <div className="dialog__body presets">
          <div className="field">
            <span className="field__label" id="lp-list">{t("presets.list")}</span>
            <div className="lx" role="listbox" aria-labelledby="lp-list" ref={listRef} onKeyDown={onListKey}>
              {keys.map((k) => (
                <div
                  key={k}
                  role="option"
                  aria-selected={k === selected}
                  tabIndex={k === selected ? 0 : -1}
                  className={`lx__item presets__item${k === selected ? " is-selected" : ""}`}
                  data-testid="preset"
                  onClick={() => p.select(k)}
                  onDoubleClick={() => void p.apply(k)}
                  onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), void p.apply(k))}
                >
                  <MiniGrid layout={k.startsWith("user:") ? (list.find((x) => `user:${x.id}` === k)?.layout ?? "1x1") : (k.slice(7) as Layout)} />
                  <span className="lx__name">{name(k)}</span>
                  <span className="t3">{kind(k)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label presets__head">
              {renaming && user ? (
                <input
                  className="presets__input"
                  aria-label={t("presets.nameLabel")}
                  defaultValue={user.name}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      void p.rename(user.id, e.currentTarget.value);
                      setRenaming(false);
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      setRenaming(false);
                    }
                  }}
                  onBlur={(e) => {
                    void p.rename(user.id, e.currentTarget.value);
                    setRenaming(false);
                  }}
                />
              ) : (
                <span>{name(selected)}</span>
              )}
              <span className="t3">{t(user ? "presets.kindUser" : "presets.kindSystem")}</span>
            </span>
            <MiniGrid layout={shownLayout} labels={labels} big />
            {user && (
              <dl>
                {labels.map((_, i) => (
                  <div className="kv" key={i}>
                    <dt>{t("presets.viewport", { n: i + 1 })}</dt>
                    <dd>{cellLabel(user.cells[i] ?? null)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <span className="field__hint">{t(user ? "presets.hintUser" : "presets.hintSystem")}</span>
            <div className="psec__row">
              {naming ? (
                <input
                  className="presets__input"
                  aria-label={t("presets.nameLabel")}
                  placeholder={t("presets.namePlaceholder")}
                  data-testid="preset-name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      void p.saveCurrent(e.currentTarget.value);
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      p.setNaming(false);
                    }
                  }}
                />
              ) : (
                <button className="btn btn--secondary btn--dense" data-testid="preset-save" onClick={() => p.setNaming(true)}>
                  {t("presets.saveAs")} <span className="kbd">{t("presets.saveKey")}</span>
                </button>
              )}
              <button className="btn btn--ghost btn--dense" disabled={!user} onClick={() => setRenaming(true)}>{t("presets.rename")}</button>
              <span className="spacer" />
              <button className="btn btn--destructive btn--dense" data-testid="preset-delete" disabled={!user || isActive} onClick={() => user && void p.remove(user.id)}>{t("presets.delete")}</button>
            </div>
            <span className="field__hint">{t("presets.deleteRule")}</span>
          </div>
        </div>
        <div className="dialog__foot">
          <button className="btn btn--secondary" onClick={p.close}>{t("presets.close")} <span className="kbd">{t("presets.escKey")}</span></button>
          <button className="btn btn--primary" data-testid="preset-apply" onClick={() => void p.apply(selected)}>{t("presets.apply")} <span className="kbd">{t("presets.enterKey")}</span></button>
        </div>
      </div>
    </div>
  );
}
