// Tests for automatic prompt fingerprints.
//
// The property that matters is narrow and worth stating plainly: the same code
// must always produce the same fingerprint, and changed code must always
// produce a different one. If either half fails, the column lies — which is the
// exact problem this module was written to remove.

import assert from "node:assert/strict";
import { hashText, fingerprint, fingerprintAll } from "../src/fingerprint.js";

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
};

// ——— hashText ———

test("hashText is stable across calls", () => {
  assert.equal(hashText("hello"), hashText("hello"));
});

test("hashText is 8 hex characters", () => {
  assert.match(hashText("anything"), /^[0-9a-f]{8}$/);
});

test("hashText changes when the text changes", () => {
  assert.notEqual(hashText("build 3-6 segments"), hashText("build 4-6 segments"));
});

test("hashText notices a single character", () => {
  assert.notEqual(hashText("~25s"), hashText("~26s"));
});

test("hashText handles null and undefined without throwing", () => {
  assert.equal(hashText(null), hashText(undefined));
  assert.match(hashText(null), /^[0-9a-f]{8}$/);
});

// ——— fingerprint ———

test("the same function fingerprints identically every time", () => {
  const f = (x) => `prompt for ${x}`;
  assert.equal(fingerprint(f), fingerprint(f));
});

test("two functions with identical source share a fingerprint", () => {
  const a = (x) => `prompt for ${x}`;
  const b = (x) => `prompt for ${x}`;
  assert.equal(fingerprint(a), fingerprint(b));
});

test("changing the prompt text changes the fingerprint", () => {
  const before = () => ["Build 3-6 segments.", "Keep it tight."].join("\n");
  const after = () => ["Build 5-10 segments.", "Keep it tight."].join("\n");
  assert.notEqual(fingerprint(before), fingerprint(after));
});

test("changing non-prompt logic inside the builder also bumps it", () => {
  // Deliberate. See the module header: over-reporting is the safe direction.
  const before = (n) => {
    const cap = 6;
    return `segments run 1-${cap}s · ${n}`;
  };
  const after = (n) => {
    const cap = 8;
    return `segments run 1-${cap}s · ${n}`;
  };
  assert.notEqual(fingerprint(before), fingerprint(after));
});

test("a comment change inside the builder bumps it too", () => {
  // Noise, but harmless: a spurious new version costs a row in a GROUP BY. A
  // missed version costs a wrong conclusion.
  const before = () => {
    // pick the hook
    return "hook";
  };
  const after = () => {
    // choose the hook
    return "hook";
  };
  assert.notEqual(fingerprint(before), fingerprint(after));
});

test("fingerprint returns null for a non-function instead of throwing", () => {
  assert.equal(fingerprint(undefined), null);
  assert.equal(fingerprint(null), null);
  assert.equal(fingerprint("a string"), null);
  assert.equal(fingerprint(42), null);
  assert.equal(fingerprint({}), null);
});

// ——— fingerprintAll ———

test("fingerprintAll maps every name to a hash", () => {
  const fps = fingerprintAll({
    director: () => "plan the session",
    compose: () => "cut the piece",
  });
  assert.deepEqual(Object.keys(fps).sort(), ["compose", "director"]);
  assert.match(fps.director, /^[0-9a-f]{8}$/);
  assert.match(fps.compose, /^[0-9a-f]{8}$/);
});

test("fingerprintAll keeps different builders distinct", () => {
  const fps = fingerprintAll({
    director: () => "plan the session",
    compose: () => "cut the piece",
  });
  assert.notEqual(fps.director, fps.compose);
});

test("fingerprintAll survives a missing builder", () => {
  // If a stage is ever renamed and a reference goes stale, we lose that one
  // measurement and keep the others. Nothing throws mid-pipeline.
  const fps = fingerprintAll({ director: () => "plan", missing: undefined });
  assert.match(fps.director, /^[0-9a-f]{8}$/);
  assert.equal(fps.missing, null);
});

test("fingerprintAll handles no argument", () => {
  assert.deepEqual(fingerprintAll(), {});
  assert.deepEqual(fingerprintAll(null), {});
});

console.log(`fingerprint: ${passed} tests passed`);
