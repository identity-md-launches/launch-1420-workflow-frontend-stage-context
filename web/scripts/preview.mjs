// Bounded local preview for browser inspection. No public bind and no persistent daemon.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export async function startPreview() {
  const root = fileURLToPath(new URL("../../dist/", import.meta.url));
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith("/preview/")) {
        response.writeHead(404).end();
        return;
      }
      let file = path.resolve(
        root,
        pathname.slice("/preview/".length) || "index.html",
      );
      if (!file.startsWith(root) || !(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/preview/` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, url } = await startPreview();
  console.log(url);
  const timer = setTimeout(() => server.close(), 15 * 60 * 1000);
  const close = () => {
    clearTimeout(timer);
    server.close();
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
