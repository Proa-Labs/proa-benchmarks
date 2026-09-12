import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePaths = [
  ".nvmrc",
  "Cargo.lock",
  "Cargo.toml",
  "package.json",
  "pnpm-lock.yaml",
  "rendering/Cargo.toml",
  "rendering/canonical",
  "rendering/src",
  "rendering/templates",
  "rendering/external",
];

export function renderingSourceFiles(workspaceDirectory) {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...sourcePaths,
    ],
    { cwd: workspaceDirectory, encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean).sort();
}

export function renderingSourceFingerprint(workspaceDirectory) {
  const hash = createHash("sha256");
  for (const relativePath of renderingSourceFiles(workspaceDirectory)) {
    hash.update(`/${relativePath}`);
    hash.update("\0");
    try {
      hash.update(readFileSync(join(workspaceDirectory, relativePath)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}
