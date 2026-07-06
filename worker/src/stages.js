// The four Phase-4 pipeline stages. Each takes a context, writes its results
// to the DB/storage, and returns the name of the next stage (or null when the
// session is ready). Rendering is Phase 5.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  db,
  downloadTo,
  uploadFrom,
  uploadJson,
  downloadJson,
} from "./supabase.js";
import {
  probe,
  extractAudioWav,
  sampleFrames,
  posterFrame,
  ffmpegRun,
} from "./ffmpeg.js";
import { askClaude, imageBlock, extractJson } from "./claude.js";

const MOMENT_TYPES = [
  "teaching",
  "hype",
  "transformation",
  "story",
  "funny",
  "technique",
];

const artifactPath = (asset, name) => {
  const dir = asset.storage_path.split("/").slice(0, 2).join("/");
  return `${dir}/artifacts/${asset.id}.${name}`;
};

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "sideline-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function loadAssets(sessionId) {
  const { data, error } = await db
    .from("media_assets")
    .select("*")
    .eq("session_id", sessionId)
    .eq("kind", "raw");
  if (error) throw new Error(`load assets: ${error.message}`);
  if (!data?.length) throw new Error("session has no uploaded videos");
  return data;
}

async function loadCoach(session) {
  const { data, error } = await db
    .from("coaches")
    .select("*")
    .eq("id", session.coach_id)
    .single();
  if (error) throw new Error(`load coach: ${error.message}`);
  return data;
}

/* ——— Stage 1: probe every raw video, extract clean audio ——— */
export async function ingest({ session }) {
  const assets = await loadAssets(session.id);
  for (const asset of assets) {
    await withTmp(async (dir) => {
      const local = await downloadTo(asset.storage_path, join(dir, "in.mp4"));
      const info = await probe(local);
      await db
        .from("media_assets")
        .update({
          duration_sec: info.duration,
          width: info.width,
          height: info.height,
        })
        .eq("id", asset.id);
      if (info.hasAudio) {
        const wav = await extractAudioWav(local, join(dir, "audio.wav"));
        await uploadFrom(wav, artifactPath(asset, "wav"), "audio/wav");
      }
    });
  }
  return "transcribe";
}

/* ——— Stage 2: Deepgram → word-level timestamps ——— */
export async function transcribe({ session }) {
  const key = process.env.DEEPGRAM_API_KEY;
  const assets = await loadAssets(session.id);
  for (const asset of assets) {
    let transcript = { text: "", words: [] };
    if (key) {
      try {
        const wav = await withTmp(async (dir) => {
          const p = join(dir, "audio.wav");
          await downloadTo(artifactPath(asset, "wav"), p);
          const { readFile } = await import("node:fs/promises");
          return readFile(p);
        });
        const res = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${key}`,
              "Content-Type": "audio/wav",
            },
            body: wav,
          }
        );
        if (!res.ok) throw new Error(`deepgram ${res.status}`);
        const json = await res.json();
        const alt = json?.results?.channels?.[0]?.alternatives?.[0];
        transcript = {
          text: alt?.transcript ?? "",
          words: (alt?.words ?? []).map((w) => ({
            w: w.punctuated_word ?? w.word,
            s: w.start,
            e: w.end,
          })),
        };
      } catch (e) {
        // Silent footage or transcription hiccup — the vision pass can still
        // find moments; don't fail the whole session.
        console.warn(`transcribe asset ${asset.id}: ${e.message}`);
      }
    }
    await uploadJson(transcript, artifactPath(asset, "transcript.json"));
  }
  return "understand";
}

/* ——— Stage 3: Claude with vision finds the moments ——— */
export async function understand({ session }) {
  const assets = await loadAssets(session.id);
  const coach = await loadCoach(session);

  for (const asset of assets) {
    const transcript = await downloadJson(
      artifactPath(asset, "transcript.json")
    ).catch(() => ({ text: "", words: [] }));

    const moments = await withTmp(async (dir) => {
      const local = await downloadTo(asset.storage_path, join(dir, "in.mp4"));
      const frames = await sampleFrames(local, asset.duration_sec, dir);
      const content = [];
      for (const f of frames) {
        content.push({ type: "text", text: `Frame at t=${f.t}s:` });
        content.push(await imageBlock(f.path));
      }
      const words = transcript.words
        .map((w) => `[${w.s?.toFixed?.(1)}] ${w.w}`)
        .join(" ");
      content.push({
        type: "text",
        text: [
          `You are analyzing raw training footage for a sports coach.`,
          `Coach profile: sport=${coach.sport}; audience=${coach.audience}; mission=${coach.mission}.`,
          `Video duration: ${asset.duration_sec ?? "unknown"}s.`,
          `Transcript with word start-times in seconds:`,
          words || "(no speech detected)",
          ``,
          `Find the 2-5 strongest moments for short-form social content.`,
          `Moments must be 4-30 seconds long, within the video's duration,`,
          `and each one a complete beat (a full cue, a full rep, a full thought).`,
          `Return ONLY a JSON array, no other text:`,
          `[{"t_start": 7.5, "t_end": 20.8, "type": "teaching|hype|transformation|story|funny|technique",`,
          `  "score": 0.0-1.0, "reason": "one sentence", "hook_idea": "short hook"}]`,
        ].join("\n"),
      });

      const reply = await askClaude({
        system:
          "You are Sideline's footage analyst. You only ever reply with valid JSON.",
        content,
      });
      return extractJson(reply);
    });

    const valid = (Array.isArray(moments) ? moments : [])
      .filter(
        (m) =>
          Number.isFinite(m.t_start) &&
          Number.isFinite(m.t_end) &&
          m.t_end > m.t_start &&
          MOMENT_TYPES.includes(m.type)
      )
      .map((m) => ({
        session_id: session.id,
        asset_id: asset.id,
        t_start: Math.max(0, m.t_start),
        t_end: asset.duration_sec
          ? Math.min(m.t_end, asset.duration_sec)
          : m.t_end,
        type: m.type,
        score: Math.max(0, Math.min(1, Number(m.score) || 0)),
        reason: String(m.reason ?? "").slice(0, 500),
        transcript_span: transcript.words
          .filter((w) => w.s >= m.t_start && w.e <= m.t_end)
          .map((w) => w.w)
          .join(" ")
          .slice(0, 1000),
      }));

    if (valid.length) {
      const { error } = await db.from("moments").insert(valid);
      if (error) throw new Error(`insert moments: ${error.message}`);
    }
  }
  return "compose";
}

/* ——— Stage 4: Claude writes each piece (EDL + copy) ——— */
export async function compose({ session }) {
  const coach = await loadCoach(session);
  const assets = await loadAssets(session.id);
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

  const { data: moments, error } = await db
    .from("moments")
    .select("*")
    .eq("session_id", session.id)
    .gte("score", 0.5)
    .order("score", { ascending: false });
  if (error) throw new Error(`load moments: ${error.message}`);
  if (!moments?.length) throw new Error("no usable moments found");

  // Top 3-6, diversity-balanced across types.
  const picked = [];
  const seenTypes = new Set();
  for (const m of moments) {
    if (picked.length >= 6) break;
    if (seenTypes.has(m.type) && moments.length > picked.length + 1) continue;
    picked.push(m);
    seenTypes.add(m.type);
  }
  for (const m of moments) {
    if (picked.length >= Math.min(6, moments.length)) break;
    if (!picked.includes(m)) picked.push(m);
  }
  if (picked.length < 3) picked.push(...moments.filter((m) => !picked.includes(m)).slice(0, 3 - picked.length));

  for (const moment of picked) {
    const asset = byId[moment.asset_id];
    if (!asset) continue;
    const landscape = (asset.width ?? 0) > (asset.height ?? 0);

    const prompt = [
      `You are the coach's content writer. Coach profile:`,
      `name=${coach.name}; sport=${coach.sport}; tones=${(coach.tones ?? []).join(", ")};`,
      `audience=${coach.audience}; mission=${coach.mission}.`,
      coach.voice_memo_transcript
        ? `How the coach actually talks (voice memo transcript): "${coach.voice_memo_transcript.slice(0, 1200)}"`
        : `(No voice memo — write plain, direct, no corporate tone.)`,
      ``,
      `The chosen moment: type=${moment.type}; ${moment.t_start}s → ${moment.t_end}s;`,
      `reason: ${moment.reason}`,
      `What is said during it: "${moment.transcript_span || "(no speech)"}"`,
      `Source video is ${landscape ? "landscape (will be cropped to 9:16)" : "vertical"}.`,
      ``,
      `Create one finished piece. Max reel length 60s, story 15s. Caption beats`,
      `must land inside the cut (times are relative to the cut start, 0 = cut start).`,
      `Return ONLY this JSON object, no other text:`,
      `{"format": "reel|story",`,
      ` "edl": {"asset_id": "${asset.id}", "in": ${moment.t_start}, "out": ${moment.t_end},`,
      `   "type": "${moment.type}",`,
      `   "crop": {"mode": "center|eased", "start_x_frac": 0.35},`,
      `   "captions": [{"text": "SHORT PUNCHY HOOK.", "t0": 0, "t1": 2.4, "style": "hook"},`,
      `                {"text": "supporting beat", "t0": 2.4, "t1": 5.0, "style": "body"}]},`,
      ` "hook": "...", "caption": "2-4 sentences in the coach's voice",`,
      ` "hashtags": "#four #to #six #tags", "cta": "aimed at the coach's mission",`,
      ` "why": "one sentence explaining this choice to the coach",`,
      ` "suggested_slot": "Tue 6:00 PM",`,
      ` "suggested_sound": "a style of trending sound, never a specific copyrighted song"}`,
    ].join("\n");

    const reply = await askClaude({
      system:
        "You write short-form sports content in the coach's own voice. You only ever reply with valid JSON.",
      content: [{ type: "text", text: prompt }],
    });
    const piece = extractJson(reply);

    // Clamp the cut and caption beats to sane bounds.
    const maxLen = piece.format === "story" ? 15 : 60;
    const cutIn = Math.max(0, Number(piece.edl?.in ?? moment.t_start));
    let cutOut = Math.min(
      Number(piece.edl?.out ?? moment.t_end),
      cutIn + maxLen
    );
    if (asset.duration_sec) cutOut = Math.min(cutOut, asset.duration_sec);
    const cutLen = cutOut - cutIn;
    const captions = (piece.edl?.captions ?? [])
      .filter((c) => c.text)
      .map((c) => ({
        text: String(c.text).slice(0, 80),
        t0: Math.max(0, Math.min(Number(c.t0) || 0, cutLen)),
        t1: Math.max(0, Math.min(Number(c.t1) || 0, cutLen)),
        style: c.style === "hook" ? "hook" : "body",
      }))
      .filter((c) => c.t1 > c.t0);

    // Poster frame from the middle of the cut → media_assets(kind render).
    // Phase 5 replaces this with the real rendered video.
    const folder = asset.storage_path.split("/").slice(0, 2).join("/");
    const posterStorage = `${folder}/posters/${moment.id}.jpg`;
    await withTmp(async (dir) => {
      const local = await downloadTo(asset.storage_path, join(dir, "in.mp4"));
      const poster = await posterFrame(
        local,
        cutIn + cutLen / 2,
        join(dir, "poster.jpg")
      );
      await uploadFrom(poster, posterStorage, "image/jpeg");
    });
    const { data: posterAsset, error: posterErr } = await db
      .from("media_assets")
      .insert({
        session_id: session.id,
        storage_path: posterStorage,
        kind: "render",
      })
      .select("id")
      .single();
    if (posterErr) throw new Error(`poster asset: ${posterErr.message}`);

    const { error: insErr } = await db.from("content_pieces").insert({
      session_id: session.id,
      format: piece.format === "story" ? "story" : "reel",
      edl: {
        asset_id: asset.id,
        in: cutIn,
        out: cutOut,
        type: moment.type,
        crop: {
          mode: piece.edl?.crop?.mode === "eased" ? "eased" : "center",
          start_x_frac: Number(piece.edl?.crop?.start_x_frac ?? 0.35),
        },
        captions,
        poster_asset_id: posterAsset.id,
      },
      render_asset_id: posterAsset.id, // replaced by the video in the render stage

      hook: String(piece.hook ?? "").slice(0, 200),
      caption: String(piece.caption ?? "").slice(0, 2000),
      hashtags: String(piece.hashtags ?? "").slice(0, 300),
      cta: String(piece.cta ?? "").slice(0, 300),
      why: String(piece.why ?? "").slice(0, 500),
      suggested_slot: String(piece.suggested_slot ?? "").slice(0, 40),
      suggested_sound: String(piece.suggested_sound ?? "").slice(0, 120),
      status: "rendering",
    });
    if (insErr) throw new Error(`insert piece: ${insErr.message}`);
  }

  return "render";
}

/* ——— Stage 5: render each EDL deterministically (SPEC recipe) ——— */
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function buildVideoFilter({ piece, srcW, srcH, accentHex, dir, writeFileSync }) {
  const edl = piece.edl;
  const dur = edl.out - edl.in;
  const parts = [];

  if (srcW > srcH) {
    // Landscape → crop to 9:16 (generalized from the SPEC's 1920x1080 recipe)
    const cw = Math.floor((srcH * 9) / 16 / 2) * 2;
    const center = Math.round((srcW - cw) / 2);
    const rawStart = Math.round((edl.crop?.start_x_frac ?? 0.35) * srcW - cw / 2);
    const startX = Math.max(0, Math.min(rawStart, srcW - cw));
    const xExpr =
      edl.crop?.mode === "eased" && startX !== center
        ? `'if(lt(t,3),${startX}+(${center}-${startX})*t/3,${center})'`
        : String(center);
    parts.push(`crop=${cw}:${srcH}:${xExpr}:0`, "scale=1080:1920");
  } else {
    // Vertical → cover-fit to 1080x1920
    parts.push(
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920"
    );
  }

  parts.push("fps=30", "format=yuv420p");
  parts.push(
    "fade=t=in:st=0:d=0.35",
    `fade=t=out:st=${Math.max(0, dur - 0.35).toFixed(2)}:d=0.35`
  );

  const accent = "0x" + (accentHex || "#C8102E").replace("#", "");
  (edl.captions ?? []).forEach((c, i) => {
    const txt = join(dir, `cap${i}.txt`);
    writeFileSync(txt, c.text); // SPEC: text via files to avoid escaping bugs
    const common = `fontfile=${FONT}:textfile=${txt}:x=(w-text_w)/2:enable='between(t,${c.t0},${c.t1})'`;
    if (c.style === "hook") {
      parts.push(
        `drawtext=${common}:fontcolor=white:fontsize=58:box=1:boxcolor=${accent}:boxborderw=22:y=1440`
      );
    } else {
      parts.push(
        `drawtext=${common}:fontcolor=white:fontsize=48:borderw=6:bordercolor=black@0.55:y=1470`
      );
    }
  });

  return parts.join(",");
}

export async function render({ session }) {
  const { writeFileSync } = await import("node:fs");
  const coach = await loadCoach(session);
  const assets = await loadAssets(session.id);
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

  const { data: pieces, error } = await db
    .from("content_pieces")
    .select("*")
    .eq("session_id", session.id)
    .in("status", ["rendering", "ready", "approved", "downloaded"]);
  if (error) throw new Error(`load pieces: ${error.message}`);

  const { data: renderAssets } = await db
    .from("media_assets")
    .select("id, storage_path")
    .eq("session_id", session.id)
    .eq("kind", "render");
  const assetPath = Object.fromEntries(
    (renderAssets ?? []).map((a) => [a.id, a.storage_path])
  );

  for (const piece of pieces ?? []) {
    const edl = piece.edl;
    const src = edl?.asset_id ? byId[edl.asset_id] : null;
    if (!src || !Number.isFinite(edl.in) || !Number.isFinite(edl.out)) continue;
    // Already has a rendered video? Skip (makes re-render jobs idempotent).
    if (piece.render_asset_id && assetPath[piece.render_asset_id]?.endsWith(".mp4"))
      continue;

    await withTmp(async (dir) => {
      const local = await downloadTo(src.storage_path, join(dir, "src.mp4"));
      const info = await probe(local);
      const dur = edl.out - edl.in;
      const vf = buildVideoFilter({
        piece,
        srcW: info.width ?? 1920,
        srcH: info.height ?? 1080,
        accentHex: coach.accent_hex,
        dir,
        writeFileSync,
      });

      const out = join(dir, "out.mp4");
      const args = [
        "-y",
        "-ss", String(edl.in),
        "-t", String(dur),
        "-i", local,
        "-vf", vf,
      ];
      if (info.hasAudio) {
        // SPEC: keep original audio, normalized
        args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "128k");
      } else {
        args.push("-an");
      }
      args.push(
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-r", "30",
        "-movflags", "+faststart",
        out
      );
      await ffmpegRun(args);

      const folder = src.storage_path.split("/").slice(0, 2).join("/");
      const storagePath = `${folder}/renders/${piece.id}.mp4`;
      await uploadFrom(out, storagePath, "video/mp4");

      const { data: videoAsset, error: vaErr } = await db
        .from("media_assets")
        .insert({
          session_id: session.id,
          storage_path: storagePath,
          kind: "render",
          duration_sec: dur,
          width: 1080,
          height: 1920,
        })
        .select("id")
        .single();
      if (vaErr) throw new Error(`render asset: ${vaErr.message}`);

      const { error: upErr } = await db
        .from("content_pieces")
        .update({
          render_asset_id: videoAsset.id,
          status: piece.status === "rendering" ? "ready" : piece.status,
        })
        .eq("id", piece.id);
      if (upErr) throw new Error(`update piece: ${upErr.message}`);
      console.log(`  rendered piece ${piece.id}`);
    });
  }

  return null; // pipeline complete — session becomes ready
}

export const STAGES = { ingest, transcribe, understand, compose, render };
