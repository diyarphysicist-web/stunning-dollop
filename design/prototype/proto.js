// Prototype layer for design/prototype/ (pages built by design/tools/compose/prototype.py).
// Routes clicks and keys between the Phase 1 screens; adds interaction states only.
(() => {
  const SCREENS = window.NM_SCREENS || [];
  const IDS = new Set(SCREENS.map((s) => s[0]));
  const file = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "");
  const ID = file === "index" ? "19-sign-in" : file;
  const FROM = new URLSearchParams(location.search).get("from");

  // ---- Page families ------------------------------------------------------
  const DSC = ["02-workspace-shell", "03-dsc-perfusion", "16-generate-series", "16-save-tables", "17-layout-presets",
    "17-shortcuts", "18-dsc-computing", "24-laptop-dsc", "24-laptop-dsc-panel"];
  const MIS = ["05-mismatch-2x2", "05-mismatch-2x3", "18-mismatch-error-invalid"];
  const DIR = ["01-study-directory", "18-directory-empty", "18-directory-loading-error"];
  const D9 = ["09-diffusion-1x1", "09-diffusion-2x2"];
  const L13 = ["13-longitudinal", "13-longitudinal-compare", "13-flair-star"];
  const A14 = ["14-advanced-diffusion-cdwi", "14-advanced-diffusion-signal"];
  const ANALYSIS = new Set(SCREENS.map((s) => s[0]).filter((id) => /^(0[2-9]|1[0-6]|24)-/.test(id)));

  // Screens that are a dialog or a mode over another screen: Esc, Cancel or Close returns to `from`, else the base.
  const BASE = {
    "04-define-aif": "03-dsc-perfusion", "06-coregistration": "11-brain-function",
    "11-paradigm-editor-block": "11-brain-function", "11-paradigm-editor-event": "11-brain-function",
    "16-generate-series": "03-dsc-perfusion", "16-save-tables": "03-dsc-perfusion",
    "17-layout-presets": "03-dsc-perfusion", "17-shortcuts": "03-dsc-perfusion",
    "18-dsc-computing": "03-dsc-perfusion", "20-test-pattern": "17-settings-display",
    "22-collect-diagnostics": "21-system",
  };

  // Directory: series number → package; launcher name → package.
  const SERIES = {
    120: "03-dsc-perfusion", 150: "03-dsc-perfusion", 160: "03-dsc-perfusion", 200: "07-dce-perfusion",
    210: "08-permeability", 211: "08-permeability", 212: "08-permeability", 306: "09-diffusion-1x1",
    332: "09-diffusion-1x1", 364: "09-diffusion-1x1", 399: "09-diffusion-1x1", 400: "14-advanced-diffusion-signal",
    500: "11-brain-function", 600: "13-longitudinal", 610: "13-flair-star", 620: "15-echo-accumulation",
  };
  const PKG = {
    "DSC Neuro Perfusion": "03-dsc-perfusion", "Longitudinal Brain Analysis": "13-longitudinal",
    "DCE / T1 Perfusion": "07-dce-perfusion", "Brain Function": "11-brain-function", Subtraction: "15-subtraction",
    Permeability: "08-permeability", Diffusion: "09-diffusion-1x1", Tractography: "10-tractography",
    "Advanced Diffusion": "14-advanced-diffusion-signal", Spectroscopy: "12-spectroscopy",
    "Echo Accumulation": "15-echo-accumulation",
  };

  // ---- Routes: [pages|null, kind, label (prefix; "" = any), action] ----------
  // action: "id" navigate · {d:"id"} open as dialog (remembers this screen) · {k:"id"} switch, keeping `from`
  //         {t:"od-id"} toggle an in-page dialog · "close" · "shortcuts" · function(el) → one of these
  const R = [
    [null, "rail", "Directory", "01-study-directory"],
    [null, "rail", "Viewer", "02-workspace-shell"],
    [null, "rail", "Analysis", () => (ANALYSIS.has(ID) ? null : "03-dsc-perfusion")],
    [null, "rail", "Results and reports", "23-report-dsc"],
    [null, "rail", "Reports", "23-report-dsc"],
    [null, "rail", "Settings", "17-settings-defaults"],
    [null, "btn", "Keyboard shortcuts", "shortcuts"],
    [null, "btn", "Account and sign out", "19-sign-in"],
    [null, "snav", "Displays and calibration", "17-settings-display"],
    [null, "snav", "Hanging protocols", "20-multi-monitor"],
    [null, "snav", "LUT and window defaults", "17-settings-defaults"],
    [null, "snav", "Licence", "21-licence"],
    [null, "snav", "System", "21-system"],
    [null, "snav", "Audit log", "22-audit-log"],
    [null, "lx", "", (el) => (el.classList.contains("is-valid") ? PKG[label(el)] : null)],

    [["19-sign-in"], "btn", "", "01-study-directory"],
    [["19-lock"], "btn", "Unlock", () => (FROM && IDS.has(FROM) ? FROM : "01-study-directory")],
    [["19-lock"], "btn", "Switch user", "19-sign-in"],
    [["19-start-neurologist"], "btn", "Open Directory", "01-study-directory"],
    [["19-start-neurologist"], "btn", "Open", (el) => {
      const tr = el.closest("tr");
      return tr && tr.parentElement.rows[0] === tr ? "05-mismatch-2x2" : "13-longitudinal";
    }],

    [DIR, "btn", "Open DSC Neuro Perfusion", "03-dsc-perfusion"],
    [DIR, "btn", "Folder", "18-directory-loading-error"],
    [DIR, "btn", "Import folder", "18-directory-loading-error"],
    [DIR, "btn", "Query PACS", "18-directory-loading-error"],

    [["02-workspace-shell"], "btn", "Continue", "03-dsc-perfusion"],
    [["02-workspace-shell"], "step", "Analysis", "03-dsc-perfusion"],
    [["02-workspace-shell"], "step", "Report", "23-report-dsc"],
    [DSC, "btn", "Continue to Generate maps", "18-dsc-computing"],
    [DSC, "btn", "Generate series", { d: "16-generate-series" }],
    [DSC, "btn", "Save tables", { d: "16-save-tables" }],
    [DSC, "btn", "Report", "23-report-dsc"],
    [DSC, "picker", "", { d: "17-layout-presets" }],
    [DSC, "btn", "Layout", { d: "17-layout-presets" }],
    [DSC, "seg", "Manual AIF", { d: "04-define-aif" }],
    [DSC, "step", "Generate maps", { d: "16-generate-series" }],
    [DSC.concat(MIS), "step", "Diffusion–Perfusion Mismatch", "05-mismatch-2x2"],
    [MIS, "step", "", "03-dsc-perfusion"],
    [["24-laptop-dsc"], "btn", "Task guidance", "24-laptop-dsc-panel"],
    [["24-laptop-dsc-panel"], "btn", "Collapse panel", "24-laptop-dsc"],
    [["24-laptop-dsc-panel"], "btn", "Task guidance", "24-laptop-dsc"],

    [MIS, "btn", "Add mismatch to report", "23-report-mismatch"],
    [MIS, "picker", "", () => (ID === "05-mismatch-2x3" ? "05-mismatch-2x2" : "05-mismatch-2x3")],
    [MIS, "btn", "Layout", () => (ID === "05-mismatch-2x3" ? "05-mismatch-2x2" : "05-mismatch-2x3")],

    [D9, "seg", "1×1", "09-diffusion-1x1"],
    [D9, "seg", "2×2", "09-diffusion-2x2"],
    [D9, "step", "Tractography", "10-tractography"],
    [["10-tractography"], "step", "Select underlay", "09-diffusion-1x1"],
    [["10-tractography"], "btn", "Bundle menu", { t: "bundle-settings" }],

    // The paradigm editor opens for the type selected in the task panel (Block or Event).
    [["11-brain-function"], "btn", "Paradigm manager", () => ({ d: paradigmEditor() })],
    [["11-brain-function"], "step", "Select paradigm", () => ({ d: paradigmEditor() })],
    [["11-brain-function"], "btn", "Review co-registration", { d: "06-coregistration" }],

    [L13, "seg", "Longitudinal", "13-longitudinal"],
    [L13, "seg", "Compare", "13-longitudinal-compare"],
    [L13, "seg", "FLAIR*", "13-flair-star"],
    [["13-longitudinal", "13-longitudinal-compare"], "btn", "Properties", { t: "lesion-properties" }],
    [["13-longitudinal-compare"], "btn", "Edit registration", { d: "06-coregistration" }],

    [A14, "seg", "Computed DWI", "14-advanced-diffusion-cdwi"],
    [A14, "seg", "Analyze signal", "14-advanced-diffusion-signal"],

    [["17-settings-display"], "btn", "Open test pattern", { d: "20-test-pattern" }],
    [["21-system"], "btn", "Collect diagnostics", { d: "22-collect-diagnostics" }],

    [["04-define-aif"], "btn", "Apply AIF", "close"],
    [["06-coregistration"], "btn", "Save registration", "close"],
    [Object.keys(BASE), "btn", "Cancel", (el) => (el.closest(".topbar") ? null : "close")],
    [Object.keys(BASE), "btn", "Close", (el) => (el.closest(".topbar") ? null : "close")],
  ];
  function paradigmEditor() {
    const sel = [...document.querySelectorAll(".seg__item.is-selected")].map((b) => b.textContent.trim());
    return sel.includes("Event") ? "11-paradigm-editor-event" : "11-paradigm-editor-block";
  }
  // Inside any dialog: these buttons close it (exact label).
  const CLOSERS = new Set(["Cancel", "Close", "Apply", "Apply preset", "Generate", "Save", "Save paradigm"]);

  // ---- Element helpers ----------------------------------------------------
  const KINDS = [["rail", ".rail__item"], ["snav", ".snav__i"], ["lx", ".lx__item"], ["step", ".step__row"],
    ["seg", ".seg__item"], ["tab", '[role="tab"]'], ["picker", ".picker"], ["btn", "button, .btn, .ibtn, .link"]];
  const ANY = KINDS.map((k) => k[1]).join(",");
  const kindOf = (el) => KINDS.find((k) => el.matches(k[1]))[0];
  function label(el) {
    if (el.matches(".lx__item")) return el.querySelector(".lx__name")?.textContent.trim() ?? "";
    if (el.matches(".step__row")) return el.querySelector(".step__title")?.textContent.trim() ?? "";
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const c = el.cloneNode(true);
    c.querySelectorAll(".kbd, .tip, svg").forEach((n) => n.remove());
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  function shortcut(el) {
    const k = el.querySelector(":scope > .kbd");
    if (k) return k.textContent.trim();
    const m = /\(([^)]+)\)\s*$/.exec(el.getAttribute("aria-label") || "");
    return m ? m[1] : null;
  }
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const dialogOf = (el) => el.closest(".scrim, .popover[data-od-id]") || el.closest("[role='dialog']");

  function resolve(el) {
    const kind = kindOf(el), lab = label(el);
    if (kind === "btn" && dialogOf(el) && CLOSERS.has(lab)) return "close";
    for (const [pages, k, l, act] of R) {
      if (k !== kind || (pages && !pages.includes(ID))) continue;
      if (l && lab !== l && !lab.startsWith(l)) continue;
      const a = typeof act === "function" ? act(el) : act;
      if (a) return a;
    }
    return null;
  }

  // ---- Actions --------------------------------------------------------------
  const url = (id, from) => `${id}.html${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  const go = (id, from) => { location.href = url(id, from); };
  const closePage = () => go(FROM && IDS.has(FROM) ? FROM : BASE[ID] || "01-study-directory");

  const host = () => document.querySelector(".app") || document.body;
  const inPage = new Map(); // od-id → element hidden at load, shown on demand
  function openDialog(name) {
    let d = inPage.get(name) || document.querySelector(`[data-nm-dyn="${name}"]`);
    if (d) { d.style.display = d.style.display === "none" ? "" : "none"; return; }
    const tpl = document.getElementById(`nm-dlg-${name}`);
    if (!tpl) return;
    d = tpl.content.firstElementChild.cloneNode(true);
    d.dataset.nmDyn = name;
    host().appendChild(d);
    wire(d);
    const box = d.querySelector('[role="dialog"]') || d;
    box.tabIndex = -1;
    box.focus();
  }
  function openDialogEl() {
    const dyn = document.querySelector("[data-nm-dyn]");
    if (dyn) return dyn;
    for (const d of inPage.values()) if (d.style.display !== "none") return d;
    return null;
  }
  function closeDialog(d) {
    if (d && d.dataset.nmDyn) d.remove();
    else if (d && inPage.has(d.dataset.odId)) d.style.display = "none";
    else closePage();
  }
  function shortcuts() {
    if (document.querySelector('[data-od-id="shortcut-sheet"]')) return;
    openDialog("shortcut-sheet");
  }

  function act(el, a) {
    if (a === "close") return closeDialog(dialogOf(el));
    if (a === "shortcuts") return shortcuts();
    if (typeof a === "string") return go(a);
    if (a.d) return go(a.d, ID);
    if (a.k) return go(a.k, FROM);
    if (a.t) return openDialog(a.t);
  }

  // Unrouted controls still change state inside the screen.
  function stateChange(el) {
    const kind = kindOf(el);
    if (kind === "seg") {
      const g = el.closest(".seg") || el.parentElement;
      g.querySelectorAll(".seg__item").forEach((s) => { s.classList.toggle("is-selected", s === el); if (s.hasAttribute("aria-checked")) s.setAttribute("aria-checked", String(s === el)); });
      // Interface scale (GEN-210): preview the chosen scale on this page.
      if (g.hasAttribute("data-ui-scale")) document.body.style.zoom = String(parseInt(el.textContent, 10) / 100);
    } else if (kind === "tab") {
      const g = el.closest('[role="tablist"]') || el.parentElement;
      g.querySelectorAll('[role="tab"]').forEach((t) => { t.classList.toggle("is-active", t === el); t.setAttribute("aria-selected", String(t === el)); });
    } else if (el.matches(".ibtn") && el.closest(".toolbar")) {
      // Tool groups run between separators: the clicked tool becomes the active one.
      const group = [];
      for (let n = el.previousElementSibling; n && !n.matches(".tb-sep"); n = n.previousElementSibling) group.push(n);
      for (let n = el.nextElementSibling; n && !n.matches(".tb-sep"); n = n.nextElementSibling) group.push(n);
      if (group.some((n) => n.matches(".ibtn.is-active"))) { group.forEach((n) => n.classList.remove("is-active")); el.classList.add("is-active"); }
    }
  }

  // ---- Wiring ---------------------------------------------------------------
  function wire(root) {
    // Tooltips drawn open in the design show on hover and focus only.
    root.querySelectorAll(".tip:not(.nm-tip)").forEach((t) => {
      t.dataset.nmStaticTip = "";
      t.style.display = "none";
      t.parentElement.dataset.nmStaticTipHost = "";
    });
    root.querySelectorAll(ANY).forEach((el) => {
      if (el.closest(".nm-menu")) return;
      if (resolve(el)) {
        el.classList.add("nm-link");
        if (!el.matches("button, a[href]")) { el.tabIndex = 0; el.setAttribute("role", el.getAttribute("role") || "button"); }
      }
      if (el.matches("button, .ibtn, .rail__item") && !el.querySelector(":scope > .kbd") && shortcut(el)) el.dataset.nmTip = "";
    });
    if (DIR.includes(ID)) root.querySelectorAll(".tbl tbody tr").forEach((tr) => tr.classList.add("nm-link"));
  }

  function showTip(el) {
    hideTips();
    const own = el.querySelector(":scope > .tip");
    if (own) { own.style.display = ""; return; }
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(el.getAttribute("aria-label") || "");
    if (!m) return;
    const tip = document.createElement("span");
    tip.className = `tip ${el.closest(".rail") ? "tip--right" : "tip--below"} nm-tip`;
    tip.setAttribute("role", "tooltip");
    tip.append(m[1] + " ");
    const k = document.createElement("span");
    k.className = "kbd";
    k.textContent = m[2];
    tip.append(k);
    el.appendChild(tip);
    if (tip.getBoundingClientRect().right > innerWidth) tip.classList.add("nm-tip--end");
  }
  function hideTips() {
    document.querySelectorAll(".nm-tip").forEach((t) => t.remove());
    document.querySelectorAll("[data-nm-static-tip]").forEach((t) => { t.style.display = "none"; });
  }

  // Screen menu behind the Prototype badge.
  let menu, badge;
  function buildMenu() {
    badge = document.createElement("button");
    badge.className = "chip nm-badge";
    badge.textContent = "Prototype";
    badge.setAttribute("aria-haspopup", "menu");
    badge.setAttribute("aria-expanded", "false");
    badge.title = "Jump to any screen";
    menu = document.createElement("div");
    menu.className = "menu nm-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Screens");
    menu.hidden = true;
    const head = document.createElement("div");
    head.className = "menu__title";
    head.textContent = "Jump to screen";
    menu.appendChild(head);
    for (const [id, title] of SCREENS) {
      const a = document.createElement("a");
      a.className = "menu__item";
      a.setAttribute("role", "menuitem");
      a.href = url(id);
      if (id === ID) a.setAttribute("aria-current", "page");
      const t = document.createElement("span");
      t.textContent = title;
      const n = document.createElement("span");
      n.className = "menu__key";
      n.textContent = id.slice(0, 2);
      a.append(t, n, document.createElement("span"));
      menu.appendChild(a);
    }
    // Screens without a status bar (sign-in, lock, test pattern) carry the badge in the corner.
    if (!document.querySelector(".statusbar")) { badge.classList.add("nm-corner"); menu.classList.add("nm-corner"); }
    document.body.append(menu, badge);
    badge.addEventListener("click", () => toggleMenu());
  }
  function toggleMenu(open = menu.hidden) {
    menu.hidden = !open;
    badge.setAttribute("aria-expanded", String(open));
    if (open) (menu.querySelector('[aria-current="page"]') || menu.querySelector("a")).focus();
  }

  // ---- Events ---------------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest(".nm-menu, .nm-badge")) toggleMenu(false);
    const el = e.target.closest(ANY);
    if (!el || el.closest(".nm-menu, .nm-badge") || el.matches(":disabled, [aria-disabled='true']")) return;
    const a = resolve(el);
    if (a) { e.preventDefault(); act(el, a); } else stateChange(el);
  });
  document.addEventListener("click", (e) => {
    const tr = e.target.closest(".tbl tbody tr");
    if (!tr || e.target.closest(ANY)) return;
    tr.parentElement.querySelectorAll("tr").forEach((r) => { r.classList.toggle("is-selected", r === tr); if (r.hasAttribute("aria-selected") || r === tr) r.setAttribute("aria-selected", String(r === tr)); });
  });
  document.addEventListener("dblclick", (e) => {
    const tr = e.target.closest(".tbl tbody tr");
    if (!tr || !DIR.includes(ID)) return;
    const series = tr.closest(".tbl--series");
    const num = series ? parseInt(tr.querySelector("td.num")?.textContent, 10) : NaN;
    const to = series ? SERIES[num] : "03-dsc-perfusion";
    if (to) go(to);
  });
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-nm-tip], [data-nm-static-tip-host]");
    if (el && !el.contains(e.relatedTarget)) showTip(el);
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-nm-tip], [data-nm-static-tip-host]");
    if (el && !el.contains(e.relatedTarget)) hideTips();
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-nm-tip], [data-nm-static-tip-host]");
    if (el && e.target.matches(":focus-visible")) showTip(el); else hideTips();
  });
  document.addEventListener("focusout", hideTips);

  function keyName(e) {
    const names = { Enter: "Enter", Delete: "Del", ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", " ": "Space" };
    const k = names[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const shift = e.shiftKey && (e.key.length > 1 || /^[A-Z]$/.test(k));
    return [e.ctrlKey && "Ctrl", e.altKey && "Alt", shift && "Shift", k].filter(Boolean).join("+");
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      hideTips();
      if (!menu.hidden) { toggleMenu(false); badge.focus(); return; }
      const d = openDialogEl();
      if (d) return closeDialog(d);
      if (BASE[ID]) return closePage();
      return;
    }
    if (!menu.hidden) return;
    const focused = document.activeElement;
    if ((e.key === "Enter" || e.key === " ") && focused && focused.classList.contains("nm-link") && !focused.matches("button, a[href]")) {
      e.preventDefault();
      focused.click();
      return;
    }
    if (e.key === "Enter" && focused && focused.matches("button, a[href]")) return;
    if (e.key === "?") { e.preventDefault(); shortcuts(); return; }
    const combo = keyName(e);
    const scope = openDialogEl() || document.querySelector(".scrim") || document;
    const target = [...scope.querySelectorAll(ANY)].find((el) => shortcut(el) === combo && visible(el) && !el.matches(":disabled, [aria-disabled='true']") && !el.closest(".nm-menu"));
    if (target) { e.preventDefault(); target.click(); }
  });

  // ---- Context menus (GEN-006) ----------------------------------------------
  // The design draws the menu open; here it opens on right-click inside a viewport and stays inside it:
  // it opens left of / above the pointer when it would cross the viewport edge, and its submenu opens
  // on whichever side has room. Neither may cover the inspector or the task panel.
  function contextMenus() {
    const ctx = document.querySelector('[data-od-id^="context-menu"]');
    if (!ctx) return;
    const sub = document.querySelector('[data-od-id^="context-submenu"]');
    const marks = document.querySelectorAll(".menu-pointer");
    const all = [ctx, sub].filter(Boolean);
    const parentItem = ctx.querySelector('[aria-haspopup="true"]');
    const hide = () => {
      all.forEach((m) => { m.style.display = "none"; });
      parentItem?.setAttribute("aria-expanded", "false");
    };
    marks.forEach((m) => m.remove());
    for (const m of all) {
      document.body.appendChild(m);
      Object.assign(m.style, { position: "fixed", right: "auto", bottom: "auto" });
    }
    hide();
    const grid = () => document.querySelector(".vgrid, main")?.getBoundingClientRect();
    function place(m, x, y, box, flipFrom) {
      m.style.display = "block";
      const w = m.offsetWidth, h = m.offsetHeight;
      let left = flipFrom ? flipFrom.right : x;
      if (left + w > box.right) left = (flipFrom ? flipFrom.left : x) - w;
      let top = y;
      if (top + h > box.bottom) top = (flipFrom ? y + parentItem.offsetHeight : y) - h;
      const g = grid() || box;
      left = Math.max(g.left, Math.min(left, g.right - w));
      top = Math.max(g.top, Math.min(top, g.bottom - h));
      m.style.left = `${left}px`;
      m.style.top = `${top}px`;
    }
    let box = null;
    document.addEventListener("contextmenu", (e) => {
      const vp = e.target.closest(".vp");
      if (!vp) return;
      e.preventDefault();
      box = vp.getBoundingClientRect();
      hide();
      place(ctx, e.clientX, e.clientY, box, null);
      // Point the submenu chevrons to the side the submenu will open on.
      const r = ctx.getBoundingClientRect();
      const roomRight = sub ? r.right + ctx.offsetWidth <= box.right : true;
      ctx.querySelectorAll('[aria-haspopup="true"] use').forEach((u) => u.setAttribute("href", roomRight ? "#i-chev-right" : "#i-chev-left"));
    });
    parentItem?.addEventListener("mouseenter", () => {
      if (!sub || !box) return;
      parentItem.setAttribute("aria-expanded", "true");
      const r = ctx.getBoundingClientRect();
      place(sub, r.right, parentItem.getBoundingClientRect().top, box, r);
    });
    ctx.querySelectorAll(".menu__item:not([aria-haspopup])").forEach((it) => it.addEventListener("mouseenter", () => {
      if (sub) sub.style.display = "none";
      parentItem?.setAttribute("aria-expanded", "false");
    }));
    sub?.querySelectorAll('[role="menuitemradio"]:not([aria-disabled="true"])').forEach((it) => it.addEventListener("click", () => {
      sub.querySelectorAll('[role="menuitemradio"]').forEach((o) => {
        const on = o === it;
        o.setAttribute("aria-checked", String(on));
        o.lastElementChild.outerHTML = on ? '<svg class="ic ic--check"><use href="#i-check"/></svg>' : "<span></span>";
      });
      hide();
    }));
    ctx.querySelectorAll(".menu__item:not([aria-haspopup])").forEach((it) => it.addEventListener("click", hide));
    document.addEventListener("mousedown", (e) => { if (!e.target.closest('[data-od-id^="context-"]') && e.button === 0) hide(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && ctx.style.display !== "none") { e.stopImmediatePropagation(); e.preventDefault(); hide(); }
    }, true);
  }

  // ---- Start ----------------------------------------------------------------
  // Static design marks become live states.
  document.querySelectorAll(".is-hover").forEach((n) => n.classList.remove("is-hover"));
  document.querySelectorAll(".is-focus").forEach((n) => n.classList.remove("is-focus"));
  // Dialogs drawn open over a base screen start closed; their trigger opens them.
  document.querySelectorAll('.popover[data-od-id="lesion-properties"], .popover[data-od-id="bundle-settings"]').forEach((d) => {
    d.style.display = "none";
    inPage.set(d.dataset.odId, d);
  });
  buildMenu();
  contextMenus();
  wire(document);
})();
