import js from "@eslint/js";
import tseslint from "typescript-eslint";

// §12 hard limits: these are the CI gate, so every one of them is `error`.
const hardLimits = {
  "max-lines": ["error", 200],
  "max-lines-per-function": ["error", 40],
  complexity: ["error", 8],
  "max-depth": ["error", 3],
  "@typescript-eslint/no-explicit-any": "error",
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: hardLimits,
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly" },
    },
    rules: { "max-lines": ["error", 200] },
  },
  {
    // Plain Node scripts outside the TS project graph (e.g. apps/audit-ui/serve.mjs).
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
    rules: { "max-lines": ["error", 200] },
  },
);
