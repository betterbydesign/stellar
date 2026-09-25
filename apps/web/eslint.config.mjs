import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  // Next's React rules still use RuleContext methods removed in ESLint 10.
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
  globalIgnores([".next/**", ".next-local/**", ".next-connected/**", "next-env.d.ts"]),
]);
