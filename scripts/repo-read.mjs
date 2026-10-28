// The one safe reader for repository state. A repository can commit links, huge files and odd
// directory names under .autopilot/ and docs/, so every script that reads them goes through here:
// regular files only, never through a link, bounded size, directory names checked against one rule.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const PLAN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_NAME = 100;
const MAX_FILE = 1024 * 1024;
const MAX_TEXT = 200;

/** One plain directory name: no '/', no '..', at most 100 chars. */
export const validName = (name) => typeof name === "string" && name.length <= MAX_NAME && PLAN_NAME.test(name) && !name.includes("..");

// The text reaches a model and, through it, a shell line: only a plain allowlist survives.
export function sanitize(reason, max = MAX_TEXT) {
  return String(reason ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/[^A-Za-z0-9 ._:,()/-]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max);
}

/** Text of a regular file, at most max bytes, never through a link. Null on any problem; never throws. */
export function readRepoFile(file, max = MAX_FILE) {
  let fd;
  try {
    if (!lstatSync(file).isFile()) return null;
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(fd).isFile()) return null;
    const buf = Buffer.alloc(max);
    let n = 0;
    for (let got = 1; got > 0 && n < max; n += got) got = readSync(fd, buf, n, max - n, n);
    return buf.toString("utf8", 0, n);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const realDir = (p) => {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Valid names of the real run directories in <root>/.autopilot/runs; [] when .autopilot or runs is a link. */
export function runNames(root) {
  try {
    const runs = join(root, ".autopilot", "runs");
    if (!realDir(join(root, ".autopilot")) || !realDir(runs)) return [];
    return readdirSync(runs).filter((n) => validName(n) && realDir(join(runs, n)));
  } catch {
    return [];
  }
}
