-- Wipe the coach's decision history so AI memory starts from honest data.
-- NOT a migration — a one-off, safe to run again if testing dirties things up.
--
-- Why: during Phase 3 every button got pressed to prove it worked, not because
-- anyone had an opinion about the reel. Roughly a dozen approvals, skips and
-- revisions in the database are test artefacts. Item 6 feeds exactly this data
-- to the director as preference, and memory built on noise is worse than no
-- memory at all.
--
-- What this clears: every decision and every measurement ABOUT a decision.
-- What this keeps: the reels themselves, their copy, their scorecard flags,
-- the director's plans, and the prompt/chip choices on sessions — those were
-- real choices, not test presses.
--
-- Visible effect: your Today tab empties and every finished reel returns to
-- Review, because nothing counts as approved or skipped any more.

update content_pieces
set
  -- the decision itself
  status = 'ready',
  skip_reason = null,
  skip_reason_text = null,
  -- how the decision was made (Phase 3.5)
  reviewed_at = null,
  review_dwell_ms = null,
  detail_opened = null,
  revision_count = 0,
  revision_history = null,
  revision_note = null,
  -- the founder's calibration ratings (Phase 3.2)
  hook_rating = null,
  pacing_rating = null,
  copy_rating = null,
  would_post_rating = null,
  founder_notes = null,
  rated_at = null
where render_asset_id is not null;

-- Anything that never finished rendering is a dead row from an interrupted
-- job; it has no video, so it can only clutter Review.
delete from content_pieces where render_asset_id is null;

select count(*) filter (where status = 'ready') as ready_to_review,
       count(*) filter (where status <> 'ready') as anything_else,
       count(*) filter (where reviewed_at is not null) as leftover_decisions
from content_pieces;
