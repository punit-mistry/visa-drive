import { defineConfig } from "vitest/config";

/**
 * Backend test harness.
 *
 * `convex-test` runs the real Convex functions against an in-memory database,
 * so every test below exercises the same authorisation code the deployment
 * runs. The edge runtime is what Convex's default runtime most closely
 * resembles — no Node built-ins, `crypto.subtle` present.
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
    testTimeout: 30_000,
  },
});
