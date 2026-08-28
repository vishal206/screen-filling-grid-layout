import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The solver is pure — no DOM needed until <Grid> gets an implementation.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
