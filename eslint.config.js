// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Brief §3.6: no raw colours, pixel sizes or font names outside the token and LUT folders. */
const NO_RAW_STYLE = [
  { selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]", message: "Use a design token; raw colours belong in packages/ui/src/tokens or packages/viewer/src/luts." },
  { selector: "Literal[value=/\\b\\d+(\\.\\d+)?px\\b/]", message: "Use a spacing/size token instead of a pixel literal." },
  { selector: "Literal[value=/\\b(Inter|JetBrains Mono)\\b/]", message: "Use the font token." },
];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/out/**", "artifacts/**", "**/node_modules/**", "engine/**", "data/**", "docs/**", "design/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...NO_RAW_STYLE] },
  },
  {
    // GEN-200: renderer components take every user-facing string from the message catalog.
    files: ["apps/desktop/src/renderer/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_RAW_STYLE,
        { selector: "JSXText[value=/[A-Za-z]/]", message: "Use t() from @neuromr/i18n (GEN-200)." },
        { selector: "JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal", message: "Use t() from @neuromr/i18n (GEN-200)." },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "apps/*/e2e/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly", window: "readonly" } },
  },
  {
    files: ["packages/ui/src/tokens/**", "packages/viewer/src/luts/**", "**/*.test.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
