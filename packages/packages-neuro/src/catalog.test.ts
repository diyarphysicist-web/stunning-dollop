import { describe, expect, it } from "vitest";
import { PackageId } from "@neuromr/contracts";
import { PACKAGES, visiblePackages } from "./catalog.js";

describe("package catalog", () => {
  it("covers every PackageId exactly once", () => {
    expect(PACKAGES.map((p) => p.id).sort()).toEqual([...PackageId.options].sort());
  });

  it("rule 4: packages from later phases are hidden", () => {
    const all = new Set(["core", "perfusion", "diffusion", "stroke", "neurosurgery", "spectroscopy", "follow-up"] as const);
    expect(visiblePackages(2, all)).toEqual([]);
    expect(visiblePackages(3, all).map((p) => p.id)).toEqual(["dsc"]);
  });

  it("§12.7: unlicensed modules are hidden", () => {
    expect(visiblePackages(10, new Set(["core"])).map((p) => p.id)).toEqual(["subtraction", "echo"]);
  });
});
