import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // The PRO tests generate the 260-person demo several times (up to ~35 s on a busy laptop).
  test: { include: ["tests/**/*.test.ts"], testTimeout: 60000 },
});
