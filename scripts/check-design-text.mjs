// Find clipped or overflowing text in the design screens (design/screens/*.html).
// For every visible text node it checks each ancestor up to the first scrollable one: text that
// extends past an ancestor with overflow hidden/clip, or is cut by text-overflow: ellipsis, is reported.
// Screens are checked at the sizes `pnpm design:render` captures (1920×1080 and 2560×1440, or the
// screen's own nm-viewport). Scroll regions marked data-nm-scrolls (long pages such as Settings) may cut
// a row at their edge. Exit code 1 when anything is clipped.
// Usage: pnpm design:text-check [name-filter]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "design/screens");
const filter = process.argv[2] ?? "";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".html") && f !== "index.html" && f.includes(filter))
  .sort();

/* global document, getComputedStyle, NodeFilter -- findClipped runs inside the page (page.evaluate) */
function findClipped() {
  const TOL = 1;
  const out = [];
  const seen = new Set();
  const visible = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    }
    return true;
  };
  const label = (el) => {
    const id = el.closest("[data-od-id]")?.getAttribute("data-od-id");
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls}${id ? ` [${id}]` : ""}`;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const host = n.parentElement;
    if (!host || host.closest("script, style, [aria-hidden='true'], .anno") || !visible(host)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    // Ellipsis truncation on the host itself.
    const hs = getComputedStyle(host);
    if (hs.textOverflow === "ellipsis" && host.scrollWidth > host.clientWidth + TOL) {
      const key = `ellipsis|${label(host)}|${text}`;
      if (!seen.has(key)) { seen.add(key); out.push({ kind: "ellipsis", where: label(host), text }); }
      continue;
    }
    for (let a = host; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const ox = cs.overflowX, oy = cs.overflowY;
      if (/auto|scroll/.test(ox) || /auto|scroll/.test(oy)) {
        // A region marked data-nm-scrolls is a long scrolling page: a row at its edge is expected.
        if (a.hasAttribute("data-nm-scrolls")) break;
        // Scrolled-away text is fine; text cut part-way at the scroll edge looks broken in a still frame.
        const b = a.getBoundingClientRect();
        const inside = (r) => r.bottom > b.top + TOL && r.top < b.bottom - TOL && r.right > b.left + TOL && r.left < b.right - TOL;
        const whole = (r) => r.top >= b.top - TOL && r.bottom <= b.bottom + TOL && r.left >= b.left - TOL && r.right <= b.right + TOL;
        const some = rects.some(inside), all = rects.every(whole);
        // A block (notice, field, row) whose first lines show and the rest is hidden is cut too.
        const block = host.closest(".notice, .field, .kv, .step, tr, .psec__row") ?? host;
        const bb = block.getBoundingClientRect();
        const blockCut = bb.top < b.bottom - TOL && bb.bottom > b.bottom + TOL && bb.height < b.height / 3;
        if ((some && !all) || (some && blockCut)) {
          const key = `cut|${label(block)}`;
          if (!seen.has(key)) { seen.add(key); out.push({ kind: "cut at scroll edge", where: label(block), text }); }
        }
        break;
      }
      const clipX = /hidden|clip/.test(ox), clipY = /hidden|clip/.test(oy);
      if (!clipX && !clipY) continue;
      const b = a.getBoundingClientRect();
      const bad = rects.some((r) =>
        (clipX && (r.left < b.left - TOL || r.right > b.right + TOL)) ||
        (clipY && (r.top < b.top - TOL || r.bottom > b.bottom + TOL)));
      if (bad) {
        const key = `clip|${label(a)}|${text}`;
        if (!seen.has(key)) { seen.add(key); out.push({ kind: "clipped", where: label(a), text }); }
        break;
      }
    }
  }
  return out;
}

const browser = await chromium.launch();
let problems = 0;
for (const file of files) {
  const html = readFileSync(join(dir, file), "utf8");
  const meta = /<meta\s+name="nm-viewport"\s+content="(\d+)x(\d+)@([\d.]+)"/.exec(html);
  const sizes = meta
    ? [{ w: Number(meta[1]), h: Number(meta[2]), dpr: Number(meta[3]) }]
    : [{ w: 1920, h: 1080, dpr: 1 }, { w: 2560, h: 1440, dpr: 1 }];
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr });
    await page.goto(pathToFileURL(join(dir, file)).href, { waitUntil: "networkidle" });
    const found = await page.evaluate(findClipped);
    await page.close();
    for (const f of found) {
      console.log(`${file} @${s.w}: ${f.kind} in ${f.where}: "${f.text.slice(0, 90)}"`);
      problems++;
    }
  }
}
await browser.close();
console.log(problems ? `${problems} clipped text item(s) in ${files.length} screens` : `text ok: ${files.length} screens`);
process.exit(problems ? 1 : 0);
