import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const OPTS = { maxBuffer: 32 * 1024 * 1024 };

// Quiet, non-interactive ffmpeg: only real errors reach the logs, and a
// failure surfaces as one short message instead of the whole transcript.
const QUIET = ["-nostdin", "-hide_banner", "-loglevel", "error"];

async function ff(args) {
  try {
    await run("ffmpeg", [...QUIET, ...args], OPTS);
  } catch (e) {
    if (e.signal === "SIGKILL" || (!e.stderr && e.killed !== false && !e.code)) {
      throw new Error(
        "ffmpeg was killed by the machine (out of memory) — the worker needs a bigger instance or lighter settings"
      );
    }
    const tail = String(e.stderr || "")
      .trim()
      .split("\n")
      .slice(-6)
      .join(" | ")
      .slice(-700);
    throw new Error(
      `ffmpeg failed (exit ${e.code ?? "?"}${e.signal ? ", signal " + e.signal : ""}): ${tail || "no error output"}`
    );
  }
}

export async function probe(localPath) {
  const { stdout } = await run(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      localPath,
    ],
    OPTS
  );
  const info = JSON.parse(stdout);
  const video = info.streams?.find((s) => s.codec_type === "video");
  const audio = info.streams?.find((s) => s.codec_type === "audio");
  // Phones store portrait video as landscape + a rotation tag; ffmpeg
  // auto-rotates frames on decode, so report the *displayed* dimensions.
  const rot = Math.abs(
    Number(
      video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
        0
    )
  );
  const swapped = rot % 180 === 90;
  return {
    duration: Number(info.format?.duration) || null,
    width: (swapped ? video?.height : video?.width) ?? null,
    height: (swapped ? video?.width : video?.height) ?? null,
    hasAudio: Boolean(audio),
  };
}

export async function extractAudioWav(localPath, outPath) {
  await ff([
    "-y", "-i", localPath,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    outPath,
  ]);
  return outPath;
}

// ——— Motion-adaptive frame sampling ———
// A fixed-interval sampler shows the AI a lot of nothing: an athlete standing
// still bills the same as the moment they leave the ground. This measures where
// the clip ACTUALLY moves, then spends frames there.

// Measure motion energy across the clip: downscale hard, difference each frame
// against the previous, and read the average brightness of that difference.
// High value = something genuinely moved.
async function motionTimeline(localPath) {
  let text = "";
  try {
    const { stdout, stderr } = await run(
      "ffmpeg",
      [
        "-nostdin", "-hide_banner", "-loglevel", "info",
        "-i", localPath,
        "-vf",
        "fps=5,scale=160:-2,tblend=all_mode=difference,signalstats,metadata=print:file=-",
        "-an", "-f", "null", "-",
      ],
      OPTS
    );
    text = String(stdout || "") + String(stderr || "");
  } catch (e) {
    text = String(e.stdout || "") + String(e.stderr || "");
  }
  const points = [];
  let t = null;
  for (const line of text.split("\n")) {
    const mt = line.match(/pts_time:([\d.]+)/);
    if (mt) {
      t = Number(mt[1]);
      continue;
    }
    const my = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
    if (my && t !== null) {
      points.push({ t, e: Number(my[1]) });
      t = null;
    }
  }
  return points;
}

// Choose timestamps: dense (~0.5s) inside a +/-2s window around each motion
// peak, sparse (~3.5s) everywhere else, capped at maxFrames with peak-adjacent
// frames winning the cap.
function pickTimestamps(timeline, duration, maxFrames) {
  if (!timeline.length) return null;
  const dur = duration || timeline[timeline.length - 1].t || 60;
  const sorted = timeline.map((p) => p.e).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] || median;
  const threshold = Math.max(p85, median * 1.6);

  const peaks = [];
  for (const p of timeline) {
    if (
      p.e >= threshold &&
      (!peaks.length || p.t - peaks[peaks.length - 1] >= 1.5)
    )
      peaks.push(Math.round(p.t * 10) / 10);
  }

  const times = new Set();
  const add = (x) => {
    const v = Math.round(Math.max(0, Math.min(x, dur)) * 10) / 10;
    times.add(v);
  };
  for (const pk of peaks) for (let x = pk - 2; x <= pk + 2; x += 0.5) add(x);
  for (let x = 0; x <= dur; x += 3.5) add(x);

  let list = [...times].sort((a, b) => a - b);
  if (list.length > maxFrames) {
    const nearPeak = (x) => peaks.some((pk) => Math.abs(x - pk) <= 2);
    const priority = list.filter(nearPeak);
    const rest = list.filter((x) => !nearPeak(x));
    list = priority.slice(0, maxFrames);
    for (const x of rest) {
      if (list.length >= maxFrames) break;
      list.push(x);
    }
    list.sort((a, b) => a - b);
  }
  return { times: list, peaks };
}

// Returns [{ path, t }] with the timestamp each frame represents.
export async function sampleFrames(localPath, duration, outDir, maxFrames = 30) {
  const timeline = await motionTimeline(localPath);
  const picked = pickTimestamps(timeline, duration, maxFrames);

  // No usable motion read (odd codec, still clip) — fall back to the old
  // uniform sampler rather than failing the stage.
  if (!picked || picked.times.length < 2) {
    const interval = Math.max(1.5, (duration || 60) / maxFrames);
    await ff([
      "-y", "-i", localPath,
      "-vf", `fps=1/${interval},scale=512:-2`,
      "-q:v", "6",
      `${outDir}/frame_%03d.jpg`,
    ]);
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(outDir))
      .filter((f) => f.startsWith("frame_"))
      .sort()
      .slice(0, maxFrames);
    return files.map((f, i) => ({
      path: `${outDir}/${f}`,
      t: Math.round(i * interval * 10) / 10,
    }));
  }

  console.log(
    `    motion peaks at [${picked.peaks.join(", ")}]s — sampling ${
      picked.times.length
    } frames clustered there`
  );

  // Exact seeks give an exact frame->timestamp mapping, which matters because
  // the AI cuts using these timestamps.
  const out = [];
  for (let i = 0; i < picked.times.length; i++) {
    const t = picked.times[i];
    const file = `${outDir}/frame_${String(i).padStart(3, "0")}.jpg`;
    try {
      await ff([
        "-y",
        "-ss", String(t),
        "-i", localPath,
        "-frames:v", "1",
        "-vf", "scale=512:-2",
        "-q:v", "6",
        file,
      ]);
      out.push({ path: file, t });
    } catch {
      // A seek past the last keyframe can come back empty — skip that frame.
    }
  }
  return out;
}

export async function ffmpegRun(args) {
  await ff(args);
}

export async function posterFrame(localPath, atSeconds, outPath) {
  await ff([
    "-y",
    "-ss", String(Math.max(0, atSeconds)),
    "-i", localPath,
    "-frames:v", "1",
    "-vf", "scale=720:-2",
    "-q:v", "4",
    outPath,
  ]);
  return outPath;
}
