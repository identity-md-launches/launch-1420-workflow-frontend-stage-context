// Measure a complete Git bundle using an isolated verification repository.
// The assignment's original .git is read-only. Nothing is staged or committed there.
import { execFileSync } from "node:child_process";
import {
  mkdir,
  readdir,
  copyFile,
  stat,
  mkdtemp,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const scratch = path.join(root, "test/scratch");
await mkdir(scratch, { recursive: true });
const folder = await mkdtemp(path.join(scratch, "submission-"));
const repo = path.join(folder, "repo");
const handoff = JSON.parse(
  await readFile(path.join(root, "web/deployment/handoff.json"), "utf8"),
);
// This worker's local history omits an older tree object. Obtain complete history
// from the handoff's public source repository, and pin it to the deployed commit.
execFileSync("git", ["clone", "--quiet", handoff.repoUrl, repo], {
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  timeout: 120000,
});
execFileSync("git", [
  "-C",
  repo,
  "checkout",
  "--quiet",
  "--detach",
  handoff.sourceCommit,
]);
const omitted = new Set([
  "node_modules",
  ".npm",
  ".cache",
  ".vite",
  "coverage",
  "test-results",
  "playwright-report",
]);
let copiedBytes = 0;
async function copy(relative) {
  for (const entry of await readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    if (omitted.has(entry.name) || entry.name.endsWith(".tsbuildinfo"))
      continue;
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${name}`);
    if (entry.isDirectory()) {
      await mkdir(path.join(repo, name), { recursive: true });
      await copy(name);
    } else {
      await mkdir(path.dirname(path.join(repo, name)), { recursive: true });
      await copyFile(path.join(root, name), path.join(repo, name));
      copiedBytes += (await stat(path.join(root, name))).size;
    }
  }
}
for (const folder of ["web", "dist", "docs"]) await copy(folder);
const git = (args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
git(["add", "--", "web", "dist", "docs"]);
const changed = git(["diff", "--cached", "--name-only"])
  .split("\n")
  .filter(Boolean);
for (const file of changed) {
  assert.ok(/^(web|dist|docs)\//.test(file), `Outside allowed scope: ${file}`);
  assert.ok(
    file === "web/.gitignore" ||
      !file.split("/").some((part) => part.startsWith(".")),
    `Unbudgeted dotfile: ${file}`,
  );
  assert.ok(
    !/(^|\/)(node_modules|\.npm|\.cache|\.vite)(\/|$)|\.tgz$/.test(file),
    `Dependency/cache archive: ${file}`,
  );
}
assert.ok(
  !git(["ls-files", "--stage"])
    .split("\n")
    .some((line) => line.startsWith("160000 ")),
  "Submodule in submission",
);
const reportIdentity = [
  "-c",
  "user.name=PULSE bundle size check",
  "-c",
  "user.email=size-check@example.invalid",
];
// This local verification commit is never delivered or pushed; only its bundle size is measured.
execFileSync("git", [
  "-C",
  repo,
  ...reportIdentity,
  "commit",
  "--quiet",
  "-m",
  "Measure permitted frontend delivery files",
]);
const bundle = path.join(folder, "complete.bundle");
git(["bundle", "create", bundle, "HEAD"]);
git(["bundle", "verify", bundle]);
const readback = path.join(folder, "readback");
execFileSync("git", ["clone", "--quiet", bundle, readback]);
assert.equal(
  execFileSync(
    "git",
    [
      "-C",
      readback,
      "show",
      `${handoff.sourceCommit}:docs/abi/PulseDrone.json`,
    ],
    { encoding: "utf8" },
  ),
  await readFile(path.join(root, "docs/abi/PulseDrone.json"), "utf8"),
);
const bytes = (await stat(bundle)).size;
assert.ok(bytes <= 8388608, `Bundle is ${bytes} bytes; budget is 8388608`);
console.log(
  JSON.stringify(
    {
      result: "pass",
      changedFiles: changed.length,
      copiedSourceExportDocsBytes: copiedBytes,
      completeGitBundleBytes: bytes,
      limitBytes: 8388608,
      checkedScope: "web/**, dist/**, docs/**, explicit web/.gitignore",
      originalGitModified: false,
      scratchBundle: path.relative(root, bundle),
    },
    null,
    2,
  ),
);
