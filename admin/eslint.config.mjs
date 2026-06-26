import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import tanstackQuery from "@tanstack/eslint-plugin-query"
import simpleImportSort from "eslint-plugin-simple-import-sort"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tanstackQuery.configs["flat/recommended"],
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      semi: ["error", "never"],
      quotes: ["error", "double"],
      "simple-import-sort/imports": ["error", {
        groups: [
          // React / Next first
          ["^react", "^next"],
          // Other external packages
          ["^@(?!/)\\w", "^\\w"],
          // Internal @/ aliases
          ["^@/"],
          // Relative imports
          ["^\\."],
        ],
      }],
      "simple-import-sort/exports": "error",
      "no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0 }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
