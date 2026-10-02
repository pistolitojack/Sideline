// Sideline worker — polls the jobs table and runs the pipeline (SPEC.md):
// ingest → transcribe → understand → compose. No Redis, no queues; a
// DB-polled job table is enough for V1. Any stage that throws marks the job
// failed with the error, retries once, and the session shows a friendly
// failed state in the app.

import { db } from "./supabase.js";
import { STAGES, cleanup } from "./stages.js";

const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const MAX_ATTEMPTS = 2;

// ——— housekeeping ———
//
// cleanup() deletes files nothing needs. It existed, was registered as a stage,
// and nothing ever queued it, so it had NEVER RUN: by 2026-10-02, 58% of the
// storage bucket was garbage the function had always been written to collect.
//
// It is driven from here rather than the job table on purpose. Every job carries
// a session, and runJob() marks that session `processing` on the way in and
// `failed` after two throws. A cleanup job would therefore have bounced a
// finished session back to "processing", and a storage hiccup would have told
// the coach their session FAILED — over housekeeping that has nothing to do with
// their reels.
//
// So it runs only when the worker is IDLE, never while a coach is waiting, and
// a failure is logged and forgotten.
const CLEANUP_EVERY_MS = Number(
  process.env.CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000,
);
// A short settling delay after boot. The redeploy race it was originally
// guarding against is now handled properly in planCleanup (an in-flight
// session's assets are untouchable), so this only needs to be long enough to
// stay out of the way of a worker that boots straight into a queued job.
const CLEANUP_FIRST_RUN_MS = Number(
  process.env.CLEANUP_FIRST_RUN_MS || 60 * 1000,
);
let nextCleanupAt = Date.now() + CLEANUP_FIRST_RUN_MS;

async function maybeCleanup() {
  if (Date.now() < nextCleanupAt) return;
  // Booked BEFORE the attempt, so a cleanup that throws every time waits its
  // full interval instead of retrying on every poll.
  nextCleanupAt = Date.now() + CLEANUP_EVERY_MS;
  try {
    await cleanup();
  } catch (err) {
    // Never fatal. Storage housekeeping failing is not a reason to stop making
    // reels, and the next run will find the same files still there.
    console.error(`cleanup failed (will retry later): ${err.message}`);
  }
}

async function claimJob() {
  const { data: candidates, error } = await db
    .from("jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("poll error:", error.message);
    return null;
  }
  const job = candidates?.[0];
  if (!job) return null;

  // Optimistic claim — only one worker wins the update.
  const { data: claimed } = await db
    .from("jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("*")
    .single();
  return claimed ?? null;
}

async function loadSession(id) {
  const { data, error } = await db
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`load session: ${error.message}`);
  return data;
}

async function runJob(job) {
  const stageFn = STAGES[job.stage];
  if (!stageFn) throw new Error(`unknown stage "${job.stage}"`);

  const session = await loadSession(job.session_id);
  await db
    .from("sessions")
    .update({ status: "processing" })
    .eq("id", session.id);

  console.log(`session ${session.id} → ${job.stage}…`);
  const next = await stageFn({ session });

  if (next) {
    await db
      .from("jobs")
      .update({
        stage: next,
        status: "pending",
        attempts: 0,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  } else {
    await db
      .from("jobs")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    await db.from("sessions").update({ status: "ready" }).eq("id", session.id);
    console.log(`session ${session.id} ✓ ready`);
  }
}

async function failJob(job, err) {
  const attempts = (job.attempts ?? 0) + 1;
  const fatal = attempts >= MAX_ATTEMPTS;
  console.error(
    `session ${job.session_id} stage ${job.stage} failed (attempt ${attempts}): ${err.message}`
  );
  await db
    .from("jobs")
    .update({
      status: fatal ? "failed" : "pending",
      attempts,
      error: String(err.message).slice(0, 900),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (fatal) {
    await db
      .from("sessions")
      .update({ status: "failed" })
      .eq("id", job.session_id);
  }
}

async function loop() {
  console.log(`Sideline worker up — polling every ${POLL_MS}ms`);
  // Say this out loud at boot. Housekeeping that runs on a timer is otherwise
  // indistinguishable from housekeeping that is not running at all — which is
  // exactly how cleanup() stayed dead for a month without anyone noticing.
  // Seeing this line also proves the deploy picked up the new code.
  console.log(
    `  housekeeping: first cleanup in ${Math.round(CLEANUP_FIRST_RUN_MS / 1000)}s, ` +
      `then every ${Math.round(CLEANUP_EVERY_MS / 3600000)}h` +
      (/^(1|true|yes)$/i.test(process.env.CLEANUP_DRY_RUN ?? "")
        ? " — DRY RUN, nothing will be deleted"
        : ""),
  );
  for (;;) {
    try {
      const job = await claimJob();
      if (job) {
        try {
          await runJob(job);
        } catch (err) {
          await failJob(job, err);
        }
        continue; // check immediately for the next stage
      }
      // Nothing to do for any coach right now — a safe moment to take out the
      // bins. Only reached when claimJob() found no pending work.
      await maybeCleanup();
    } catch (err) {
      console.error("loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
