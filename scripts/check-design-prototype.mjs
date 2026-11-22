// Click through the clickable prototype in design/prototype/ and check every page loads cleanly.
// Usage: pnpm design:prototype-check   (rebuild first with python design/tools/compose/prototype.py)
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "design", "prototype");
const href = (f) => pathToFileURL(join(dir, f)).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`${page.url()}: failed to load ${r.url()}`));
page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()}: ${m.text()}`));

const here = () => decodeURIComponent(page.url().split("/").pop());
let steps = 0;
async function expectAt(name, what) {
  steps += 1;
  try {
    await page.waitForURL((u) => u.pathname.endsWith(`/${name}.html`), { timeout: 5000, waitUntil: "load" });
  } catch {
    problems.push(`${what}: expected ${name}.html, at ${here()}`);
  }
}
async function expectVisible(selector, visible, what) {
  steps += 1;
  const n = await page.locator(selector).count();
  const v = n > 0 && (await page.locator(selector).first().isVisible());
  if (v !== visible) problems.push(`${what}: ${selector} ${visible ? "not visible" : "still visible"} on ${here()}`);
}
const click = (sel, opts) => page.locator(sel).first().click({ timeout: 5000, ...opts });
const btn = (text) => page.locator("button:visible", { hasText: text }).first();

// 1. Every page loads without script errors or missing files, and has the badge.
const files = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
for (const f of files) {
  await page.goto(href(f));
  await expectVisible(".nm-badge", true, `badge on ${f}`);
}

try {
// 2. Sign-in → Directory → packages.
await page.goto(href("index.html"));
await btn("Continue as").click({ timeout: 5000 });
await expectAt("01-study-directory", "sign-in");
await page.locator(".tbl--series tr", { hasText: "T1 DCE permeability" }).dblclick({ timeout: 5000 });
await expectAt("08-permeability", "double-click series 210");
await click('.rail__item[aria-label^="Directory"]');
await expectAt("01-study-directory", "rail Directory");
await page.locator(".tbl--series tr", { hasText: "SWI EPI" }).dblclick({ timeout: 5000 });
await expectAt("13-flair-star", "double-click series 610");
await page.locator(".seg__item", { hasText: "Compare" }).click({ timeout: 5000 });
await expectAt("13-longitudinal-compare", "seg Compare");
await btn("Properties").click({ timeout: 5000 });
await expectVisible('[data-od-id="lesion-properties"]', true, "Properties opens lesion dialog (compare)");
await page.keyboard.press("Escape");
await expectVisible('[data-od-id="lesion-properties"]', false, "Esc closes lesion dialog");
await page.locator(".seg__item", { hasText: "Longitudinal" }).click({ timeout: 5000 });
await expectAt("13-longitudinal", "seg Longitudinal");
await expectVisible('[data-od-id="lesion-properties"]', false, "lesion dialog starts closed");
await btn("Properties").click({ timeout: 5000 });
await expectVisible('[data-od-id="lesion-properties"]', true, "Properties opens lesion dialog");
await page.locator('[data-od-id="lesion-properties"] button', { hasText: "Cancel" }).click({ timeout: 5000 });
await expectVisible('[data-od-id="lesion-properties"]', false, "Cancel closes lesion dialog");

await page.keyboard.press("Control+1");
await expectAt("01-study-directory", "Ctrl+1");
await page.locator(".lx__item", { hasText: "DSC Neuro Perfusion" }).click({ timeout: 5000 });
await expectAt("03-dsc-perfusion", "launcher DSC");

// 3. DSC dialogs open over the screen and close with Esc or Cancel.
await btn("Generate series").click({ timeout: 5000 });
await expectAt("16-generate-series", "Generate series");
await page.keyboard.press("Escape");
await expectAt("03-dsc-perfusion", "Esc closes Generate series");
await page.keyboard.press("Control+s");
await expectAt("16-save-tables", "Ctrl+S");
await page.locator(".dialog button", { hasText: "Cancel" }).click({ timeout: 5000 });
await expectAt("03-dsc-perfusion", "Cancel closes Save tables");
await click(".picker");
await expectAt("17-layout-presets", "layout picker");
await page.locator(".dialog button", { hasText: "Close" }).click({ timeout: 5000 });
await expectAt("03-dsc-perfusion", "Close closes Layout presets");
await page.locator(".seg__item", { hasText: "Manual AIF" }).click({ timeout: 5000 });
await expectAt("04-define-aif", "Manual AIF");
await page.keyboard.press("Escape");
await expectAt("03-dsc-perfusion", "Esc closes Define AIF");
await page.keyboard.press("?");
await expectVisible('[data-od-id="shortcut-sheet"]', true, "? opens shortcut sheet");
await page.keyboard.press("Escape");
await expectVisible('[data-od-id="shortcut-sheet"]', false, "Esc closes shortcut sheet");
await page.locator(".step__title", { hasText: "Diffusion–Perfusion Mismatch" }).click({ timeout: 5000 });
await expectAt("05-mismatch-2x2", "step Mismatch");
await click(".picker");
await expectAt("05-mismatch-2x3", "layout 2×3");
await btn("Add mismatch to report").click({ timeout: 5000 });
await expectAt("23-report-mismatch", "Add mismatch to report");

// 4. Tooltips, hover and the screen menu.
await page.goto(href("03-dsc-perfusion.html"));
await page.hover('.rail__item[aria-label^="Directory"]');
await expectVisible(".rail .tip:has-text('Ctrl+1')", true, "rail tooltip shows shortcut");
await page.hover('.ibtn[aria-label^="Mirror line"]');
await expectVisible(".tip:has-text('Mirror line')", true, "static tooltip shows on hover");
await click(".nm-badge");
await expectVisible(".nm-menu", true, "badge opens screen menu");
await page.locator(".nm-menu a", { hasText: "Spectroscopy" }).click({ timeout: 5000 });
await expectAt("12-spectroscopy", "menu jump");

// 5. Settings, diffusion, brain function, laptop.
await click('.rail__item[aria-label^="Settings"]');
await expectAt("17-settings-defaults", "rail Settings");
await page.locator(".snav__i", { hasText: "Displays and calibration" }).click({ timeout: 5000 });
await expectAt("17-settings-display", "settings nav displays");
await btn("Open test pattern").click({ timeout: 5000 });
await expectAt("20-test-pattern", "test pattern");
await page.keyboard.press("Escape");
await expectAt("17-settings-display", "Esc closes test pattern");
await page.locator(".snav__i", { hasText: "System" }).click({ timeout: 5000 });
await expectAt("21-system", "settings nav system");
await btn("Collect diagnostics").click({ timeout: 5000 });
await expectAt("22-collect-diagnostics", "collect diagnostics");
await page.locator(".dialog button", { hasText: "Cancel" }).click({ timeout: 5000 });
await expectAt("21-system", "Cancel closes diagnostics");
await page.goto(href("09-diffusion-1x1.html"));
await page.locator(".seg__item", { hasText: "2×2" }).click({ timeout: 5000 });
await expectAt("09-diffusion-2x2", "diffusion 2×2");
await page.locator(".step__title", { hasText: "Tractography" }).click({ timeout: 5000 });
await expectAt("10-tractography", "step Tractography");
await page.goto(href("11-brain-function.html"));
await btn("Paradigm manager").click({ timeout: 5000 });
await expectAt("11-paradigm-editor-block", "paradigm manager (Block)");
await page.keyboard.press("Escape");
await expectAt("11-brain-function", "Esc closes paradigm editor");
await page.locator(".seg__item", { hasText: "Event" }).first().click({ timeout: 5000 });
await btn("Paradigm manager").click({ timeout: 5000 });
await expectAt("11-paradigm-editor-event", "paradigm manager (Event)");
await page.locator(".dialog button", { hasText: "Cancel" }).click({ timeout: 5000 });
await expectAt("11-brain-function", "Cancel closes paradigm editor");
await page.goto(href("24-laptop-dsc.html"));
await click('[aria-label^="Task guidance (Ctrl+B)"]');
await expectAt("24-laptop-dsc-panel", "laptop panel");

} catch (e) {
  problems.push(`stopped: ${e.message.split(/\r?\n/)[0]} (at ${here()})`);
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in ${steps} checks`);
  process.exit(1);
}
console.log(`prototype ok: ${files.length} pages, ${steps} checks`);
