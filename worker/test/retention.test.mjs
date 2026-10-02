// Tests for what cleanup is allowed to delete.
//
// This function removes files permanently and had never run in production, so
// the cases that matter most are the ones where it must delete NOTHING. A
// cleanup that collects too little wastes disk; a cleanup that collects too
// much destroys a coach's reels with no way back.

import assert from "node:assert/strict";
import {
  planCleanup,
  artifactPath,
  chunks,
  RAW_RETENTION_DAYS,
} from "../src/retention.js";

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

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2); // 2026-10-02
const ago = (days) => new Date(NOW - days * DAY).toISOString();

// Orphan collection only ever touches FINISHED sessions, so most tests need one.
const READY = [{ id: "s1", status: "ready", created_at: ago(1) }];

// ——— the dangerous cases: must delete nothing ———

test("a live reel and its poster are never orphans", () => {
  const plan = planCleanup({
    renderAssets: [
      { id: "r1", storage_path: "u/s/reel.mp4", session_id: "s1" },
      { id: "p1", storage_path: "u/s/posters/x.jpg", session_id: "s1" },
    ],
    pieces: [{ render_asset_id: "r1", edl: { poster_asset_id: "p1" } }],
    sessions: READY,
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, []);
});

test("a poster referenced ONLY from the edl is not an orphan", () => {
  // The poster has no column of its own — miss this link and every poster in
  // the account gets deleted.
  const plan = planCleanup({
    renderAssets: [{ id: "p1", storage_path: "u/s/posters/x.jpg", session_id: "s1" }],
    pieces: [{ render_asset_id: null, edl: { poster_asset_id: "p1" } }],
    sessions: READY,
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, []);
});

// ——— the render race: an asset exists before the piece points at it ———

test("an unreferenced render of a STILL-PROCESSING session is never deleted", () => {
  // render() inserts the asset, then updates the piece. In that gap the reel
  // looks like an orphan. Two workers (a redeploy) could catch it there.
  const plan = planCleanup({
    renderAssets: [{ id: "fresh", storage_path: "u/s/just-made.mp4", session_id: "s1" }],
    pieces: [], // the piece has not been linked yet
    sessions: [{ id: "s1", status: "processing", created_at: ago(0) }],
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, []);
  assert.equal(plan.heldInFlight, 1);
});

test("a queued session's assets are held too", () => {
  const plan = planCleanup({
    renderAssets: [{ id: "fresh", storage_path: "u/s/a.mp4", session_id: "s1" }],
    pieces: [],
    sessions: [{ id: "s1", status: "queued", created_at: ago(0) }],
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, []);
  assert.equal(plan.heldInFlight, 1);
});

test("an orphan whose session no longer exists is held, not deleted", () => {
  // Unknown state is not a licence to delete.
  const plan = planCleanup({
    renderAssets: [{ id: "x", storage_path: "u/s/a.mp4", session_id: "vanished" }],
    pieces: [],
    sessions: [],
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, []);
  assert.equal(plan.heldInFlight, 1);
});

test("one session finishing does not unlock another's in-flight assets", () => {
  const plan = planCleanup({
    renderAssets: [
      { id: "done", storage_path: "u/s1/old.mp4", session_id: "s1" },
      { id: "busy", storage_path: "u/s2/new.mp4", session_id: "s2" },
    ],
    pieces: [],
    sessions: [
      { id: "s1", status: "ready", created_at: ago(5) },
      { id: "s2", status: "processing", created_at: ago(0) },
    ],
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, ["u/s1/old.mp4"]);
  assert.equal(plan.heldInFlight, 1);
});

test("no pieces AND no render assets deletes nothing", () => {
  const plan = planCleanup({ renderAssets: [], pieces: [], now: NOW });
  assert.deepEqual(plan.orphanPaths, []);
  assert.deepEqual(plan.artifactPaths, []);
  assert.deepEqual(plan.rawPaths, []);
});

test("raw footage of a session that is still PROCESSING is never touched", () => {
  const plan = planCleanup({
    rawAssets: [{ id: "a1", storage_path: "u/s/in.mov", session_id: "s1" }],
    sessions: [{ id: "s1", status: "processing", created_at: ago(400) }],
    now: NOW,
  });
  assert.deepEqual(plan.rawPaths, []);
  assert.deepEqual(plan.artifactPaths, []);
});

test("raw footage of a finished session INSIDE the window is kept", () => {
  // Revisions need the source video. Deleting this breaks "ask for changes".
  const plan = planCleanup({
    rawAssets: [{ id: "a1", storage_path: "u/s/in.mov", session_id: "s1" }],
    sessions: [{ id: "s1", status: "ready", created_at: ago(29) }],
    now: NOW,
  });
  assert.deepEqual(plan.rawPaths, []);
});

test("a session with no created_at is never aged out", () => {
  const plan = planCleanup({
    rawAssets: [{ id: "a1", storage_path: "u/s/in.mov", session_id: "s1" }],
    sessions: [{ id: "s1", status: "ready", created_at: null }],
    now: NOW,
  });
  assert.deepEqual(plan.rawPaths, []);
});

// ——— the collecting cases: must delete exactly the right thing ———

test("a render no piece points at IS an orphan", () => {
  const plan = planCleanup({
    renderAssets: [
      { id: "live", storage_path: "u/s/live.mp4", session_id: "s1" },
      { id: "dead", storage_path: "u/s/dead.mp4", session_id: "s1" },
    ],
    pieces: [{ render_asset_id: "live", edl: {} }],
    sessions: READY,
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, ["u/s/dead.mp4"]);
  assert.deepEqual(plan.orphanAssetIds, ["dead"]);
  assert.equal(plan.heldInFlight, 0);
});

test("the superseded render of a revised piece is collected", () => {
  // Every re-cut renders a new mp4 and leaves the previous one behind.
  const plan = planCleanup({
    renderAssets: [
      { id: "v1", storage_path: "u/s/take1.mp4", session_id: "s1" },
      { id: "v2", storage_path: "u/s/take2.mp4", session_id: "s1" },
    ],
    pieces: [{ render_asset_id: "v2", edl: {} }],
    sessions: READY,
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, ["u/s/take1.mp4"]);
});

test("both files of a deleted piece are collected", () => {
  const plan = planCleanup({
    renderAssets: [
      { id: "r", storage_path: "u/s/gone.mp4", session_id: "s1" },
      { id: "p", storage_path: "u/s/posters/gone.jpg", session_id: "s1" },
    ],
    pieces: [], // the piece row was deleted; its files were left behind
    sessions: READY,
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths.sort(), [
    "u/s/gone.mp4",
    "u/s/posters/gone.jpg",
  ]);
});

test("intermediates of a finished session are collected", () => {
  const plan = planCleanup({
    rawAssets: [{ id: "a1", storage_path: "u1/s1/in.mov", session_id: "s1" }],
    sessions: [{ id: "s1", status: "ready", created_at: ago(1) }],
    now: NOW,
  });
  assert.deepEqual(plan.artifactPaths, [
    "u1/s1/artifacts/a1.wav",
    "u1/s1/artifacts/a1.transcript.json",
  ]);
});

test("a FAILED session's leftovers are collected too", () => {
  const plan = planCleanup({
    rawAssets: [{ id: "a1", storage_path: "u1/s1/in.mov", session_id: "s1" }],
    sessions: [{ id: "s1", status: "failed", created_at: ago(99) }],
    now: NOW,
  });
  assert.equal(plan.artifactPaths.length, 2);
  assert.deepEqual(plan.rawPaths, ["u1/s1/in.mov"]);
});

test("raw footage past the window is collected", () => {
  const plan = planCleanup({
    rawAssets: [{ id: "a1", storage_path: "u/s/in.mov", session_id: "s1" }],
    sessions: [{ id: "s1", status: "ready", created_at: ago(31) }],
    now: NOW,
  });
  assert.deepEqual(plan.rawPaths, ["u/s/in.mov"]);
});

test("the window boundary is exactly RAW_RETENTION_DAYS", () => {
  const inside = planCleanup({
    rawAssets: [{ id: "a", storage_path: "u/s/a.mov", session_id: "s" }],
    sessions: [
      { id: "s", status: "ready", created_at: ago(RAW_RETENTION_DAYS - 1) },
    ],
    now: NOW,
  });
  const outside = planCleanup({
    rawAssets: [{ id: "a", storage_path: "u/s/a.mov", session_id: "s" }],
    sessions: [
      { id: "s", status: "ready", created_at: ago(RAW_RETENTION_DAYS + 1) },
    ],
    now: NOW,
  });
  assert.deepEqual(inside.rawPaths, []);
  assert.deepEqual(outside.rawPaths, ["u/s/a.mov"]);
});

test("one coach's data never reaches another's session", () => {
  const plan = planCleanup({
    rawAssets: [
      { id: "mine", storage_path: "me/s1/in.mov", session_id: "s1" },
      { id: "theirs", storage_path: "you/s2/in.mov", session_id: "s2" },
    ],
    sessions: [
      { id: "s1", status: "ready", created_at: ago(99) },
      { id: "s2", status: "processing", created_at: ago(99) },
    ],
    now: NOW,
  });
  assert.deepEqual(plan.rawPaths, ["me/s1/in.mov"]);
});

// ——— garbage in ———

test("no arguments at all returns an empty plan", () => {
  const plan = planCleanup();
  assert.deepEqual(plan.orphanPaths, []);
  assert.deepEqual(plan.artifactPaths, []);
  assert.deepEqual(plan.rawPaths, []);
});

test("pieces with null edl do not throw", () => {
  const plan = planCleanup({
    renderAssets: [{ id: "r", storage_path: "u/s/a.mp4", session_id: "s1" }],
    pieces: [{ render_asset_id: null, edl: null }],
    sessions: READY,
    now: NOW,
  });
  assert.deepEqual(plan.orphanPaths, ["u/s/a.mp4"]);
});

test("a raw asset whose session is not in the list is left alone", () => {
  const plan = planCleanup({
    rawAssets: [{ id: "a", storage_path: "u/s/a.mov", session_id: "missing" }],
    sessions: [],
    now: NOW,
  });
  assert.deepEqual(plan.rawPaths, []);
  assert.deepEqual(plan.artifactPaths, []);
});

// ——— helpers ———

test("artifactPath uses the first two path segments", () => {
  assert.equal(
    artifactPath({ id: "abc", storage_path: "user1/sess1/in.mov" }, "wav"),
    "user1/sess1/artifacts/abc.wav",
  );
});

test("chunks splits evenly and handles remainders", () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 100), []);
  assert.deepEqual(chunks([1], 100), [[1]]);
});

test("chunks survives nonsense", () => {
  assert.deepEqual(chunks(null, 10), []);
  assert.deepEqual(chunks([1, 2], 0), []);
});

console.log(`retention: ${passed} tests passed`);
