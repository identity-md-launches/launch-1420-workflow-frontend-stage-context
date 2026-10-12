import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "attested-development-config",
      // Development consumes the same generated manifest and ABI files as production.
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const pathname = new URL(request.url ?? "/", "http://localhost")
            .pathname;
          if (
            !/^\/(imd-deployment\.json|abi\/[A-Za-z0-9_-]+\.json)$/.test(
              pathname,
            )
          )
            return next();
          try {
            const file = fileURLToPath(
              new URL(`../dist${pathname}`, import.meta.url),
            );
            const bytes = await readFile(file);
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(bytes);
          } catch {
            response.statusCode = 503;
            response.end(
              'Run "npm run build" first to generate the deployment export.',
            );
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
