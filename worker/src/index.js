// Sideline worker — polls the jobs table and runs the pipeline (SPEC.md):
// ingest → transcribe → understand → compose. No Redis, no queues; a
// DB-polled job table is enough for V1. Any stage that throws marks the job
// failed with the error, retries once, and the session shows a friendly
// failed state in the app.

import { db } from "./supabase.js";
import { STAGES } from "./stages.js";

const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const MAX_ATTEMPTS = 2;

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
    } catch (err) {
      console.error("loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
