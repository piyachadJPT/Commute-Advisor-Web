import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // DB tests share one local stack and create/delete their own users.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    globalSetup: ["./tests/db/global-setup.ts"],
  },
});
