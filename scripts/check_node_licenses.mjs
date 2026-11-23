// Fails when a production Node dependency is GPL or AGPL licensed (brief §13 open-source rule).
import { execFileSync } from "node:child_process";

// pnpm is a .cmd shim on Windows, which needs a shell to start.
const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8", shell: process.platform === "win32" });
const byLicense = JSON.parse(raw || "{}");
const forbidden = Object.keys(byLicense).filter((l) => /\b(A?GPL)\b/i.test(l) && !/LGPL/i.test(l));
let count = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  count += pkgs.length;
  if (forbidden.includes(license)) for (const p of pkgs) console.error(`forbidden licence ${license}: ${p.name}@${p.versions?.join(",")}`);
}
console.log(`${count} production packages checked`);
process.exit(forbidden.length ? 1 : 0);
