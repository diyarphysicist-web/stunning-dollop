import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp.js";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("renderer CSP", () => {
  it("is strict in production: no inline or remote scripts, no remote connections", () => {
    const csp = buildCsp(undefined);
    expect(directive(csp, "script-src")).toBe("script-src 'self'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp).not.toMatch(/unsafe-eval|localhost|127\.0\.0\.1|ws:/);
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });

  it("allows the React Refresh preamble and HMR only with a dev server", () => {
    const csp = buildCsp("http://localhost:5173/");
    expect(directive(csp, "script-src")).toContain("'unsafe-inline'");
    for (const origin of ["ws:", "http://localhost:*", "http://127.0.0.1:*"]) expect(directive(csp, "connect-src")).toContain(origin);
    expect(csp).not.toContain("unsafe-eval");
  });
});
