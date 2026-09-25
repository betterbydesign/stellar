import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  test: {
    include: ["apps/web/test/connected-journey.acceptance.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    maxWorkers: 1,
  },
  resolve: { alias: { "server-only": `${here}empty.mjs` } },
});
