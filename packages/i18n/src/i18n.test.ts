import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { en, formatIdentifier, formatMachine, formatQuantity, messageIds, parseNumericInput, t } from "./index.js";

describe("GEN-200 message catalog", () => {
  it("every message is valid ICU and formats", () => {
    for (const id of messageIds()) expect(() => new IntlMessageFormat(en[id], "en-US")).not.toThrow();
  });

  it("substitutes arguments", () => {
    expect(t("app.version", { version: "0.1.0" })).toBe("Version 0.1.0");
    expect(t("app.windowTitle", { study: "none" })).toBe("NeuroMR-PRO");
    expect(t("app.windowTitle", { study: "MR Brain" })).toBe("MR Brain — NeuroMR-PRO");
  });

  it("contains no banned regulatory or placeholder wording (brief §2.3, §2.4)", () => {
    const banned = /FDA|CE[- ]mark|research use only|lorem|coming soon|TODO/i;
    for (const id of messageIds()) expect(en[id]).not.toMatch(banned);
  });
});

describe("GEN-201 number formatting", () => {
  it("groups quantities of 1,000 or more with a comma and uses a period decimal mark", () => {
    expect(formatQuantity(2009)).toBe("2,009");
    expect(formatQuantity(1298.6, { decimals: 1 })).toBe("1,298.6");
    expect(formatQuantity(999.5, { decimals: 1 })).toBe("999.5");
    expect(formatQuantity(-1500)).toBe("−1,500");
  });

  it("never groups identifiers or machine output", () => {
    expect(formatIdentifier(104)).toBe("104");
    expect(formatIdentifier(11112)).toBe("11112");
    expect(formatMachine(1298.6)).toBe("1298.6");
  });

  it("formats ICU number arguments en-US", () => {
    expect(new IntlMessageFormat("{n, number} files", "en-US").format({ n: 2009 })).toBe("2,009 files");
  });

  it("accepts typed numbers with or without grouping commas", () => {
    expect(parseNumericInput("1,000")).toBe(1000);
    expect(parseNumericInput("1000.25")).toBe(1000.25);
    expect(parseNumericInput(" -12.5 ")).toBe(-12.5);
    expect(parseNumericInput("1,00")).toBeNull();
    expect(parseNumericInput("1.000,5")).toBeNull();
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("abc")).toBeNull();
  });
});
