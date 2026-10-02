// What cleanup is allowed to delete — the decision, with no I/O.
//
// WHY THIS IS A SEPARATE MODULE
// cleanup() deletes files permanently. Until now its decision logic was tangled
// up with the database calls that execute it, which meant it could not be
// tested without a live Supabase and a willingness to lose real reels. Nobody
// was ever going to run that test, so the logic went unexamined — and it had
// been unreachable since the day it was written, so nothing caught it.
//
// Everything here is pure: given lists of rows, it returns lists of paths. The
// scary half (actually removing files) stays in stages.js and does no thinking.

// Raw footage is kept this long after a session finishes so revisions, which
// need the source video to re-cut, keep working for a month.
export const RAW_RETENTION_DAYS = 30;

// A session is finished — and its leftovers collectable — in these states.
const FINISHED = ["ready", "failed"];

// Where the per-clip intermediates live. Derived from the asset's own path so
// it stays in step with wherever the clip was uploaded.
//
// Shared with stages.js on purpose: ingest writes these files and cleanup
// deletes them, and if the two ever disagreed about the path, cleanup would
// silently delete nothing while reporting success.
export function artifactPath(asset, name) {
  const dir = asset.storage_path.split("/").slice(0, 2).join("/");
  return `${dir}/artifacts/${asset.id}.${name}`;
}

// Which render assets does no content piece point at any more?
//
// A piece references its video through render_asset_id and its poster from
// inside its edl. Both count — miss the poster link and every poster in the
// account looks unreferenced.
function findOrphans(renderAssets, pieces) {
  const referenced = new Set();
  for (const p of pieces) {
    if (p.render_asset_id) referenced.add(p.render_asset_id);
    const poster = p.edl?.poster_asset_id;
    if (poster) referenced.add(poster);
  }
  return renderAssets.filter((r) => !referenced.has(r.id));
}

// Decide everything cleanup will remove on this run.
//
// Takes COMPLETE lists. A caller that passes a truncated `pieces` list gets a
// plan that deletes live reels, so the reads that feed this must be paginated
// and must throw rather than return partial data. See readAll() in stages.js.
export function planCleanup({
  renderAssets = [],
  pieces = [],
  rawAssets = [],
  sessions = [],
  now = Date.now(),
} = {}) {
  // 1. Renders and posters nothing references: old re-renders, and the files
  //    of pieces that were deleted. Deleting a piece row does not touch its
  //    media_assets rows, so every deleted piece leaves two files behind.
  const orphans = findOrphans(renderAssets, pieces);

  // 2. Intermediates (wav + transcript) of any finished session. These are
  //    worthless the moment the session completes.
  const finishedIds = new Set(
    sessions.filter((s) => FINISHED.includes(s.status)).map((s) => s.id),
  );
  const artifactPaths = [];
  for (const a of rawAssets) {
    if (!finishedIds.has(a.session_id)) continue;
    artifactPaths.push(artifactPath(a, "wav"));
    artifactPaths.push(artifactPath(a, "transcript.json"));
  }

  // 3. The original uploads of finished sessions past the retention window —
  //    the single biggest consumer of space. After this a reel can no longer be
  //    re-cut, which is why the window exists at all.
  const cutoff = now - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const oldFinishedIds = new Set(
    sessions
      .filter(
        (s) =>
          FINISHED.includes(s.status) &&
          s.created_at &&
          new Date(s.created_at).getTime() < cutoff,
      )
      .map((s) => s.id),
  );
  const rawPaths = rawAssets
    .filter((a) => oldFinishedIds.has(a.session_id))
    .map((a) => a.storage_path);

  return {
    orphans,
    orphanPaths: orphans.map((o) => o.storage_path),
    orphanAssetIds: orphans.map((o) => o.id),
    artifactPaths,
    rawPaths,
  };
}

// Split a list into fixed-size batches. Storage removes and `in` filters both
// have request limits, so every bulk operation goes out in chunks.
export function chunks(arr, n) {
  if (!Array.isArray(arr) || n < 1) return [];
  return Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n),
  );
}
