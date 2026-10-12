// Measure a complete Git bundle using an isolated verification repository.
// Nothing is staged or committed in the original checkout by this check.
import { execFileSync } from "node:child_process";
import {
  mkdir,
  readdir,
  copyFile,
  stat,
  mkdtemp,
  rm,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const handoff = JSON.parse(
  await readFile(
    new URL("../deployment/handoff.json", import.meta.url),
    "utf8",
  ),
);
const scratch = path.join(root, "test/scratch");
await mkdir(scratch, { recursive: true });
const folder = await mkdtemp(path.join(scratch, "submission-"));
const repo = path.join(folder, "repo");
// Clone the complete current history, including the previously accepted frontend.
// A source-only checkout would undercount the bundle for a revision.
execFileSync("git", ["clone", "--quiet", "--no-hardlinks", root, repo], {
  timeout: 120000,
});
// The worker may provide a partial clone with promised historical tree objects.
// Fill the deployed-source history in this disposable checkout, retaining the
// accepted frontend commit from the local clone. Never alter root Git config.
execFileSync(
  "git",
  [
    "-C",
    repo,
    "fetch",
    "--quiet",
    "--refetch",
    "--no-filter",
    handoff.repoUrl,
    handoff.sourceCommit,
  ],
  {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 120000,
  },
);
// Replace allowed trees so files deleted by Vite do not survive in the size check.
for (const folder of ["web", "dist", "docs"])
  await rm(path.join(repo, folder), { recursive: true, force: true });
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
git(["add", "--all", "--", "web", "dist", "docs"]);
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
if (changed.length)
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
  execFileSync(
    "git",
    ["-C", root, "show", `${handoff.sourceCommit}:docs/abi/PulseDrone.json`],
    { encoding: "utf8" },
  ),
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
