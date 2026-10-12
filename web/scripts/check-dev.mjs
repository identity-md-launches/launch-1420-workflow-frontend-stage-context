import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  server: { host: "127.0.0.1", port: 0 },
});
try {
  await server.listen();
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;
  const expected = JSON.parse(
    await readFile(
      new URL("../../dist/imd-deployment.json", import.meta.url),
      "utf8",
    ),
  );
  const response = await fetch(`${base}/imd-deployment.json`);
  assert.equal(response.status, 200);
  const actual = await response.json();
  assert.deepEqual(actual, expected);
  for (const contract of actual.contracts) {
    const response = await fetch(`${base}/${contract.abiPath}`);
    assert.equal(response.status, 200);
    assert.equal(
      await response.text(),
      await readFile(
        new URL(`../../dist/${contract.abiPath}`, import.meta.url),
        "utf8",
      ),
    );
  }
  assert.ok((await (await fetch(base)).text()).includes("/src/main.tsx"));
  await server.environments.client.depsOptimizer?.scanProcessing;
  const transformed = await server.transformRequest("/src/main.tsx");
  assert.ok(transformed?.code.includes("createRoot"));
  const report = {
    checkedAt: new Date().toISOString(),
    result: "pass",
    checks: [
      "Development HTML and transformed TypeScript entrypoint",
      "Same deployment manifest as final export",
      "Byte-identical exported ABI responses",
    ],
    chainWrites: 0,
  };
  await writeFile(
    new URL(
      "../../docs/frontend/evidence/dev-validation.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Development server: manifest, ABIs and HTML match the configured source/export.",
  );
} finally {
  await server.close();
}
