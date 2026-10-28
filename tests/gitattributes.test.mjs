import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test(".gitattributes forces LF checkouts", () => {
  const text = readFileSync(join(root, ".gitattributes"), "utf8");
  assert.match(text, /^\* text=auto eol=lf\s*$/m);
});
