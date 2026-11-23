/** GEN-201: en-US number formatting for quantities; identifiers and machine output are never grouped. */
const LOCALE = "en-US";

export interface QuantityOptions {
  /** Fixed number of decimals; defaults to up to 3 significant decimals without trailing zeros. */
  decimals?: number;
}

const cache = new Map<string, Intl.NumberFormat>();
function formatter(decimals: number | undefined): Intl.NumberFormat {
  const key = String(decimals);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, decimals === undefined
      ? { maximumFractionDigits: 3, useGrouping: true }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: true });
    cache.set(key, f);
  }
  return f;
}

/** A displayed quantity: period decimal mark, comma grouping from 1,000 (2,009 files; W 1,298.6). */
export function formatQuantity(value: number, options: QuantityOptions = {}): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "−∞" : "—";
  return formatter(options.decimals).format(value).replace("-", "−");
}

/** An identifier (series number, port, AE title index, year): digits only, never grouped. */
export function formatIdentifier(value: number): string {
  return String(value);
}

/** Machine-readable output (CSV, DICOM, JSON): plain JavaScript number text, never grouped. */
export function formatMachine(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

const NUMERIC_INPUT = /^[-+−]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/;

/** Parses a typed number with or without grouping commas; returns null when it is not a number. */
export function parseNumericInput(text: string): number | null {
  const s = text.trim();
  if (s === "" || !NUMERIC_INPUT.test(s) || !/\d/.test(s)) return null;
  const n = Number(s.replace(/,/g, "").replace("−", "-"));
  return Number.isFinite(n) ? n : null;
}
