import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const shared = (p: string) => fileURLToPath(new URL(`../../packages/shared/src/${p}`, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: /^@hamza\/shared\/(.*)$/, replacement: shared("$1") },
      { find: /^@hamza\/shared$/, replacement: shared("index.ts") },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
});
