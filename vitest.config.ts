import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config. Mirrors the `@/...` path alias from tsconfig.json so
 * tests can import the same way the app does. Only includes *.test.ts(x)
 * files under src/ to keep test discovery fast and predictable.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      // v8 is faster than istanbul and built into Node — no extra transforms.
      provider: "v8",
      reporter: ["text", "html"],
      // Only measure coverage on files we have tests for or could write tests
      // for. Pages, app routes, and UI components live behind React Server
      // Components and would need jsdom/RTL — excluded here.
      include: ["src/lib/**/*.{ts,tsx}"],
      exclude: [
        "src/lib/**/*.test.{ts,tsx}",
        "src/lib/db/**", // DB schema + connection — infra, not logic
        "src/lib/**/types.ts", // type-only modules
        "src/lib/**/config.ts", // pure constants
        "src/lib/hunt/companies.ts", // data list
      ],
    },
  },
});
