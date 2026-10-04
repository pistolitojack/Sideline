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

// How long a FINISHED reel's video file is kept after the coach decides on it.
//
// Skipped reels go fast. The app never displays them again — Today, the day
// strip and the approved list all filter to approved/downloaded — so the file is
// dead weight the moment it is swiped away. One day rather than zero buys back
// the two things instant deletion costs: a mis-swipe is recoverable, and the
// admin view can still play the reel the same evening, which is where the
// founder studies what went wrong.
//
// Approved reels are kept two months. A coach approves a reel in order to post
// it, which happens within days. Sixty days is generous against that behaviour,
// and roughly doubles how many coaches fit under the storage plan compared with
// six months.
//
// The point of these windows is not the megabytes. Without them nothing is ever
// deleted, so there is no steady state at all — every coach's footprint grows
// forever. A window turns unbounded growth into a ceiling.
export const SKIPPED_RETENTION_DAYS = 1;
export const APPROVED_RETENTION_DAYS = 60;

// A session is finished — and its leftovers collectable — in these states.
const FINISHED = ["ready", "failed"];

const DAY_MS = 24 * 60 * 60 * 1000;

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
//
// THE RACE THIS GUARDS AGAINST, which is subtle and would have destroyed work:
// render() inserts the media_assets row and only THEN updates the piece to point
// at it. In the gap between those two statements, a freshly rendered reel is
// indistinguishable from an orphan. The poster has the same gap in
// composePlannedPiece(). One worker never trips this, because cleanup only runs
// from the idle branch of its own loop — but a Railway redeploy briefly runs two
// workers, and an idle one would happily delete the reel the busy one just made.
//
// So orphan collection is restricted to sessions that are FINISHED. An in-flight
// session is `processing`, which puts every asset it is still creating out of
// reach no matter how many workers are running. It also makes cleanup's rule
// uniform: it only ever touches sessions that are done.
function findOrphans(renderAssets, pieces, finishedIds) {
  const referenced = new Set();
  for (const p of pieces) {
    if (p.render_asset_id) referenced.add(p.render_asset_id);
    const poster = p.edl?.poster_asset_id;
    if (poster) referenced.add(poster);
  }
  const unreferenced = renderAssets.filter((r) => !referenced.has(r.id));
  return {
    orphans: unreferenced.filter((r) => finishedIds.has(r.session_id)),
    // Reported, not deleted. If this is ever large it means sessions are
    // getting stuck mid-pipeline, which is worth knowing on its own.
    heldInFlight: unreferenced.filter((r) => !finishedIds.has(r.session_id))
      .length,
  };
}

// Which decided pieces have outlived their window, and which of their files go.
//
// Returns ASSET IDS, not paths. Deleting the media_assets row is the point:
// content_pieces.render_asset_id is a foreign key declared ON DELETE SET NULL,
// so removing the row makes the piece say "I have no video" by itself. Without
// that the app would keep signing a URL for a file that is not there and show a
// broken player.
//
// A skipped piece keeps its poster. The reel is ~11.94 MB and its poster ~0.07
// MB, so holding the thumbnail costs 0.6% of the space and keeps the admin view
// showing what the reel looked like next to the reason it was rejected.
//
// Pieces still awaiting review (`ready`) have no window — the coach has not seen
// them yet, and nothing should expire in front of someone who never looked.
function findExpired(pieces, finishedIds, now) {
  const videoIds = new Set();
  const posterIds = new Set();

  for (const p of pieces) {
    // Same rule as everything else here: never touch a session still working.
    if (!finishedIds.has(p.session_id)) continue;

    // When the coach decided. Falls back to creation for pieces made before
    // review timestamps existed.
    const decidedAt = p.reviewed_at || p.created_at;
    if (!decidedAt) continue;
    const ageMs = now - new Date(decidedAt).getTime();
    if (!Number.isFinite(ageMs)) continue;

    if (p.status === "skipped") {
      if (ageMs >= SKIPPED_RETENTION_DAYS * DAY_MS && p.render_asset_id) {
        videoIds.add(p.render_asset_id);
      }
      continue;
    }

    if (p.status === "approved" || p.status === "downloaded") {
      if (ageMs < APPROVED_RETENTION_DAYS * DAY_MS) continue;
      if (p.render_asset_id) videoIds.add(p.render_asset_id);
      const poster = p.edl?.poster_asset_id;
      if (poster) posterIds.add(poster);
    }
  }

  return { videoIds, posterIds };
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
  // Which sessions are done. Nothing cleanup does ever touches a session that
  // is still working — see findOrphans for the race that makes this essential.
  const finishedIds = new Set(
    sessions.filter((s) => FINISHED.includes(s.status)).map((s) => s.id),
  );

  // 1. Renders and posters nothing references: old re-renders, and the files
  //    of pieces that were deleted. Deleting a piece row does not touch its
  //    media_assets rows, so every deleted piece leaves two files behind.
  const { orphans, heldInFlight } = findOrphans(
    renderAssets,
    pieces,
    finishedIds,
  );

  // 2. Intermediates (wav + transcript) of any finished session. These are
  //    worthless the moment the session completes.
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

  // 4. Finished reels past their window: skipped after SKIPPED_RETENTION_DAYS
  //    (video only, poster kept), approved and downloaded after
  //    APPROVED_RETENTION_DAYS (both).
  const { videoIds, posterIds } = findExpired(pieces, finishedIds, now);
  const expiredIds = new Set([...videoIds, ...posterIds]);
  const expired = renderAssets.filter((r) => expiredIds.has(r.id));

  // Orphans and expired pieces can never overlap — an orphan is by definition
  // referenced by no piece, and an expired file is referenced by one — but they
  // are merged through a Set so that stays true by construction rather than by
  // argument. Deleting the same row twice would make the second delete a no-op
  // and the file count a lie.
  const byId = new Map();
  for (const a of [...orphans, ...expired]) byId.set(a.id, a);
  const assetsToDelete = [...byId.values()];

  return {
    orphans,
    orphanPaths: orphans.map((o) => o.storage_path),
    orphanAssetIds: orphans.map((o) => o.id),
    expired,
    expiredPaths: expired.map((e) => e.storage_path),
    // Every media_assets row this run removes, files and rows together.
    assetsToDelete,
    artifactPaths,
    rawPaths,
    heldInFlight,
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
