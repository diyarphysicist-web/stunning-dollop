// Render the exported Open Design screens in design/screens/*.html to PNG (brief §3.5, §3.9).
// Each screen is captured at 1920×1080 @1x (<name>.png) and 2560×1440 @1x (<name>@2560.png).
// A screen that targets another device declares it with
//   <meta name="nm-viewport" content="1280x720@1.5">
// and is then captured once at that CSS size and device scale (<name>.png).
// Usage: pnpm design:render [name-filter]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "design/screens");
const filter = process.argv[2] ?? "";
const files = readdirSync(dir).filter((f) => f.endsWith(".html") && f.includes(filter)).sort();

const browser = await chromium.launch();
let count = 0;
for (const file of files) {
  const html = readFileSync(join(dir, file), "utf8");
  const meta = /<meta\s+name="nm-viewport"\s+content="(\d+)x(\d+)@([\d.]+)"/.exec(html);
  const sizes = meta
    ? [{ w: Number(meta[1]), h: Number(meta[2]), dpr: Number(meta[3]), suffix: "" }]
    : [
        { w: 1920, h: 1080, dpr: 1, suffix: "" },
        { w: 2560, h: 1440, dpr: 1, suffix: "@2560" },
      ];
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr });
    const errors = [];
    page.on("requestfailed", (r) => errors.push(`failed: ${r.url()}`));
    await page.goto(pathToFileURL(join(dir, file)).href, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(dir, file.replace(/\.html$/, `${s.suffix}.png`)) });
    await page.close();
    if (errors.length) console.warn(`${file}: ${errors.join(", ")}`);
    count++;
  }
}
await browser.close();
console.log(`rendered ${count} PNGs from ${files.length} screens`);
