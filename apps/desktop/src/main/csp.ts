/**
 * Content-Security-Policy for the renderer. Production loads only the local bundle: no inline
 * scripts, no eval, no remote origins (the product is fully offline). The dev server additionally
 * needs the inline React Refresh preamble from @vitejs/plugin-react and its HMR connections, so
 * those are allowed only when a dev server URL is set (electron-vite dev).
 */
const DEV_ORIGINS = ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"];

export function buildCsp(devServerUrl: string | undefined): string {
  const dev = Boolean(devServerUrl);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", dev ? ["'self'", "'unsafe-inline'", ...DEV_ORIGINS.slice(0, 2)] : ["'self'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", dev ? ["'self'", "ws:", ...DEV_ORIGINS] : ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}
