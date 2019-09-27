import * as cp from "child_process";
import * as path from "path";

export function getGitRepositoryDirectoryForFile(file: string) {
  return cp
    .execSync("git rev-parse --show-toplevel", {
      cwd: path.dirname(file),
      encoding: "utf-8"
    })
    .trim();
}

export function getGitSHA(dir: string) {
  return cp
    .execSync("git rev-parse HEAD", {
      cwd: dir,
      encoding: "utf-8"
    })
    .trim();
}
