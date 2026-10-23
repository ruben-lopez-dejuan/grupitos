import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Generating the 260-person demo twice takes a few seconds; leave room for a busy machine.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20000 },
});
