import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, engineText, rewrite } from "../tools/rea-bump.mjs";

test("decide: bumps only a newer plain version without install-time scripts", () => {
  assert.equal(decide("6.8.0", { version: "6.8.0", scripts: {} }).action, "none");
  assert.equal(decide("6.8.0", { version: "6.7.9", scripts: {} }).action, "none");
  assert.equal(decide("6.8.0", { version: "6.9.0", scripts: { test: "x" } }).action, "bump");
  assert.equal(decide("6.8.0", { version: "6.10.0", scripts: {} }).action, "bump");
  assert.equal(decide("6.8.0", { version: "7.0.0-rc.1", scripts: {} }).action, "refuse");
  assert.equal(decide("6.8.0", { version: "6.9.0", scripts: { postinstall: "node x.js" } }).action, "refuse");
  assert.equal(decide("6.8.0", {}).action, "refuse");
});

test("engineText and rewrite update the pin and the Node range together", () => {
  assert.equal(engineText("^22.23.4 || ^24.22.1 || >=26.12.1"), "22.23.4+, 24.22.1+ or 26.12.1+");
  assert.equal(engineText(">=22"), null);
  const doc = "needs rea-agents@6.8.0 and Node 22.23.4+, 24.22.1+ or 26.12.1+.";
  assert.equal(rewrite(doc, "rea-agents@6.8.0", "rea-agents@6.9.0", "22.24.0+, 24.23.0+ or 26.13.0+"), "needs rea-agents@6.9.0 and Node 22.24.0+, 24.23.0+ or 26.13.0+.");
  assert.equal(rewrite(doc, "rea-agents@6.8.0", "rea-agents@6.9.0", null), "needs rea-agents@6.9.0 and Node 22.23.4+, 24.22.1+ or 26.12.1+.");
});
