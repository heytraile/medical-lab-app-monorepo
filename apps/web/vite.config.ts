import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 3100,
    host: true,
  },
  resolve: {
    // Contracts ships CJS in dist; compile from source so Vite gets ESM named exports.
    alias: {
      "@drax-lis/contracts": path.resolve(
        root,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
  optimizeDeps: {
    include: ["zod"],
  },
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), viteReact()],
});
