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
      const frames = await sampleFrames(local, asset.duration_sec, dir, 40);
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
          session.brief
            ? `THE COACH'S NOTE FOR THIS SESSION (top priority, honor it): "${String(session.brief).slice(0, 500)}"`
            : ``,
          `Video duration: ${asset.duration_sec ?? "unknown"}s.`,
          `Transcript with word start-times in seconds:`,
          words || "(no speech detected)",
          ``,
          `Find the 2-5 strongest moments for short-form social content.`,
          `HARD RULES:`,
          `- Every moment is a COMPLETE arc: setup, action, OUTCOME. Never end`,
          `  before the payoff — if someone shoots, scores, finishes a rep,`,
          `  lands a combo, or a drill resolves, the outcome AND about 2 seconds`,
          `  of reaction after it belong INSIDE the moment. A clip that cuts`,
          `  before the ball lands is worthless.`,
          `- Frames are ~1.5-2s apart, so if action is building in the last`,
          `  frame you can see, extend t_end past it rather than guessing short.`,
          `- Mix lengths: short highlights (6-15s) AND longer teaching/story`,
          `  segments (20-45s) when the footage supports them. Do not return`,
          `  only sub-10s clips.`,
          `- 4-45 seconds each, within the video's duration.`,
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
        // Pad both ends: sampling is coarse, and reactions sell the moment.
        t_start: Math.max(0, m.t_start - 0.75),
        t_end: asset.duration_sec
          ? Math.min(m.t_end + 2, asset.duration_sec)
          : m.t_end + 2,
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

  // One writing sitting for the whole pack: the model sees every moment at
  // once, so it can vary hooks/angles instead of converging on one formula.
  const momentBrief = picked
    .map((m, i) => {
      const a = byId[m.asset_id];
      const landscape = (a?.width ?? 0) > (a?.height ?? 0);
      return `#${i} · type=${m.type} · ${m.t_start.toFixed(1)}s → ${m.t_end.toFixed(1)}s (${(
        m.t_end - m.t_start
      ).toFixed(1)}s available) · ${landscape ? "landscape" : "vertical"} source · reason: ${m.reason} · said: "${(m.transcript_span || "(no speech)").slice(0, 300)}"`;
    })
    .join("\n");

  const prompt = [
    `You are the coach's content writer. Coach profile:`,
    `name=${coach.name}; sport=${coach.sport}; tones=${(coach.tones ?? []).join(", ")};`,
    `audience=${coach.audience}; mission=${coach.mission}.`,
    coach.voice_memo_transcript
      ? `How the coach actually talks (voice memo transcript): "${coach.voice_memo_transcript.slice(0, 1200)}"`
      : `(No voice memo — write plain, direct, no corporate tone.)`,
    session.brief
      ? `THE COACH'S NOTE FOR THIS SESSION (top priority, honor it in every piece): "${String(session.brief).slice(0, 500)}"`
      : ``,
    ``,
    `Today's moments — create one finished piece per moment (${picked.length} total):`,
    momentBrief,
    ``,
    `VARIETY RULES — these make or break the coach's page:`,
    `- Every hook uses a DIFFERENT structure. Rotate: bold claim, question,`,
    `  contrarian take, direct callout to the viewer, mini-story opener, number/stat.`,
    `- Never reuse a sentence pattern across pieces. Formulas like "X isn't born" or`,
    `  "X is a skill" may appear at most ONCE in the whole set.`,
    `- Vary the caption angle across pieces: teach one, celebrate one, tell the`,
    `  story behind one, challenge the viewer in another.`,
    `- Respect each moment's full length — a 30s teaching moment stays ~30s. Do NOT`,
    `  trim everything to sub-10s clips; the set should mix short and long.`,
    `  Story format max 15s; reels up to 60s.`,
    `- Caption beats land inside the cut (t=0 = cut start): hook beat in the first`,
    `  2-3 seconds, then 1-3 body beats spread through the cut.`,
    ``,
    `Return ONLY a JSON array, one object per moment:`,
    `[{"moment_index": 0, "format": "reel|story",`,
    `  "edl": {"in": <cut start s>, "out": <cut end s>,`,
    `    "crop": {"mode": "center|eased", "start_x_frac": 0.35},`,
    `    "captions": [{"text": "HOOK.", "t0": 0, "t1": 2.4, "style": "hook"},`,
    `                 {"text": "body beat", "t0": 2.4, "t1": 5.0, "style": "body"}]},`,
    `  "hook": "...", "caption": "1-4 sentences in the coach's voice",`,
    `  "hashtags": "#four #to #six #tags", "cta": "aimed at the coach's mission",`,
    `  "why": "one sentence explaining this choice to the coach",`,
    `  "suggested_slot": "Tue 6:00 PM",`,
    `  "suggested_sound": "a style of trending sound, never a specific song"}]`,
  ].join("\n");

  const reply = await askClaude({
    system:
      "You write short-form sports content in the coach's own voice. Every piece must feel different from the others. You only ever reply with valid JSON.",
    content: [{ type: "text", text: prompt }],
    maxTokens: 8000,
  });
  const drafts = extractJson(reply);
  if (!Array.isArray(drafts) || !drafts.length)
    throw new Error("compose returned no pieces");

  for (const piece of drafts) {
    const moment = picked[Number(piece.moment_index)];
    const asset = moment ? byId[moment.asset_id] : null;
    if (!moment || !asset) continue;

    // Clamp the cut and caption beats to sane bounds.
    const maxLen = piece.format === "story" ? 15 : 60;
    const cutIn = Math.max(0, Number(piece.edl?.in ?? moment.t_start));
    let cutOut = Math.min(
      Number(piece.edl?.out ?? moment.t_end),
      cutIn + maxLen
    );
    if (asset.duration_sec) cutOut = Math.min(cutOut, asset.duration_sec);
    const cutLen = cutOut - cutIn;
    if (!(cutLen > 1)) continue;
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

  // ——— Mix-tape reel: one montage cut across ALL the session's videos ———
  if (session.montage && moments.length >= 3) {
    try {
      await composeMontage({ session, coach, moments, byId });
    } catch (e) {
      // A failed montage never sinks the rest of the pack.
      console.warn(`montage skipped: ${e.message}`);
    }
  }

  return "render";
}

async function composeMontage({ session, coach, moments, byId }) {
  const usable = moments.filter((m) => byId[m.asset_id]).slice(0, 14);
  const clipList = usable
    .map(
      (m, i) =>
        `#${i} · ${m.t_start.toFixed(1)}s → ${m.t_end.toFixed(1)}s · type=${m.type} · score=${m.score} · ${m.reason}`
    )
    .join("\n");

  const prompt = [
    `You are cutting ONE fast montage reel ("mix-tape") for a sports coach from`,
    `today's best raw moments, which come from ${new Set(usable.map((m) => m.asset_id)).size} different videos.`,
    `Coach: ${coach.name}; sport=${coach.sport}; mission=${coach.mission}.`,
    session.brief
      ? `THE COACH'S NOTE (honor it): "${String(session.brief).slice(0, 500)}"`
      : ``,
    ``,
    `Available moments (pick sub-ranges from INSIDE them):`,
    clipList,
    ``,
    `MONTAGE RULES:`,
    `- 6-12 segments, each 1.5-4 seconds, total 20-40 seconds.`,
    `- OPEN on the single most explosive payoff (a score, a landed rep, a`,
    `  reaction) — earn the next 30 seconds in the first two.`,
    `- Vary the energy: action, detail shots, coaching voice if any moment has`,
    `  speech, and end on a strong beat (celebration or the coach).`,
    `- Segments must come from at least 2 different moments; spread across`,
    `  videos where possible.`,
    `- Captions: one hook in the first 2s + 1-2 body beats. Times are relative`,
    `  to the montage start (t=0).`,
    ``,
    `- Each segment names its transition INTO the next segment:`,
    `  "cut" (hard cut on the beat — the default for energy),`,
    `  "fade" (smooth crossfade for mood shifts),`,
    `  "slideleft"/"slideright" (whip to a new angle), "circleopen" (reveal).`,
    `  Mostly cuts and fades; at most 1-2 specialty wipes per reel.`,
    `Return ONLY this JSON object:`,
    `{"segments": [{"moment_index": 0, "in": <abs seconds>, "out": <abs seconds>, "transition": "cut|fade|slideleft|slideright|circleopen"}, ...],`,
    ` "captions": [{"text": "HOOK.", "t0": 0, "t1": 2.2, "style": "hook"},`,
    `              {"text": "body beat", "t0": 8, "t1": 11, "style": "body"}],`,
    ` "hook": "...", "caption": "1-3 sentences in the coach's voice",`,
    ` "hashtags": "#four #to #six #tags", "cta": "aimed at the mission",`,
    ` "why": "one sentence for the coach",`,
    ` "suggested_slot": "Sat 10:00 AM",`,
    ` "suggested_sound": "a style of trending sound, never a specific song"}`,
  ].join("\n");

  const reply = await askClaude({
    system:
      "You are a short-form sports video editor with elite taste in pacing. You only ever reply with valid JSON.",
    content: [{ type: "text", text: prompt }],
    maxTokens: 4000,
  });
  const draft = extractJson(reply);

  // Validate segments: inside their moment (with a little slack), 1-6s each,
  // total capped at 60s.
  let total = 0;
  const segments = (draft.segments ?? [])
    .map((seg) => {
      const m = usable[Number(seg.moment_index)];
      if (!m) return null;
      const asset = byId[m.asset_id];
      const lo = Math.max(0, m.t_start - 1);
      const hi = Math.min(
        m.t_end + 1,
        asset.duration_sec ?? m.t_end + 1
      );
      const start = Math.max(lo, Math.min(Number(seg.in), hi - 1));
      const end = Math.min(hi, Math.max(start + 1, Math.min(Number(seg.out), start + 6)));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 1)
        return null;
      const TRANSITIONS = ["cut", "fade", "slideleft", "slideright", "circleopen"];
      return {
        asset_id: m.asset_id,
        in: start,
        out: end,
        transition: TRANSITIONS.includes(seg.transition) ? seg.transition : "cut",
      };
    })
    .filter(Boolean)
    .filter((seg) => {
      if (total >= 60) return false;
      total += seg.out - seg.in;
      return true;
    });
  if (segments.length < 3) throw new Error("montage returned too few usable segments");

  const captions = (draft.captions ?? [])
    .filter((c) => c.text)
    .map((c) => ({
      text: String(c.text).slice(0, 80),
      t0: Math.max(0, Math.min(Number(c.t0) || 0, total)),
      t1: Math.max(0, Math.min(Number(c.t1) || 0, total)),
      style: c.style === "hook" ? "hook" : "body",
    }))
    .filter((c) => c.t1 > c.t0);

  // Poster from the opening segment.
  const first = segments[0];
  const firstAsset = byId[first.asset_id];
  const folder = firstAsset.storage_path.split("/").slice(0, 2).join("/");
  const posterStorage = `${folder}/posters/montage-${session.id}.jpg`;
  await withTmp(async (dir) => {
    const local = await downloadTo(firstAsset.storage_path, join(dir, "in.mp4"));
    const poster = await posterFrame(
      local,
      first.in + (first.out - first.in) / 2,
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
  if (posterErr) throw new Error(`montage poster: ${posterErr.message}`);

  const { error: insErr } = await db.from("content_pieces").insert({
    session_id: session.id,
    format: "reel",
    edl: {
      segments,
      type: "montage",
      crop: { mode: "center", start_x_frac: 0.5 },
      captions,
      poster_asset_id: posterAsset.id,
    },
    render_asset_id: posterAsset.id,
    hook: String(draft.hook ?? "").slice(0, 200),
    caption: String(draft.caption ?? "").slice(0, 2000),
    hashtags: String(draft.hashtags ?? "").slice(0, 300),
    cta: String(draft.cta ?? "").slice(0, 300),
    why: String(draft.why ?? "Best of the whole session in one cut.").slice(0, 500),
    suggested_slot: String(draft.suggested_slot ?? "").slice(0, 40),
    suggested_sound: String(draft.suggested_sound ?? "").slice(0, 120),
    status: "rendering",
  });
  if (insErr) throw new Error(`insert montage: ${insErr.message}`);
}

/* ——— Stage 5: render each EDL deterministically (SPEC recipe) ———
   Handles single cuts AND multi-video montages: every piece is a list of
   segments (a single cut = one segment). Each segment is normalized to
   1080x1920@30 with uniform audio, then one final pass concatenates them
   and burns captions, fades, and loudness normalization. */
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// drawtext has no auto-wrap: break captions into up to 3 fitted lines.
function wrapText(text, maxChars) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3).join("\n");
}

// Crop/scale a source to 1080x1920 given its displayed dimensions.
function geometryFilter(srcW, srcH, crop) {
  if (srcW > srcH) {
    const cw = Math.floor((srcH * 9) / 16 / 2) * 2;
    const center = Math.round((srcW - cw) / 2);
    const rawStart = Math.round((crop?.start_x_frac ?? 0.5) * srcW - cw / 2);
    const startX = Math.max(0, Math.min(rawStart, srcW - cw));
    const xExpr =
      crop?.mode === "eased" && startX !== center
        ? `'if(lt(t,3),${startX}+(${center}-${startX})*t/3,${center})'`
        : String(center);
    return `crop=${cw}:${srcH}:${xExpr}:0,scale=1080:1920`;
  }
  return "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
}

// Captions + fades for the final pass over the assembled timeline.
function overlayFilter({ edl, totalDur, accentHex, dir, writeFileSync }) {
  const parts = ["format=yuv420p"];
  parts.push(
    "fade=t=in:st=0:d=0.35",
    `fade=t=out:st=${Math.max(0, totalDur - 0.35).toFixed(2)}:d=0.35`
  );
  const accent = "0x" + (accentHex || "#C8102E").replace("#", "");
  (edl.captions ?? []).forEach((c, i) => {
    const txt = join(dir, `cap${i}.txt`);
    const hook = c.style === "hook";
    writeFileSync(txt, wrapText(c.text, hook ? 20 : 28));
    const common = `fontfile=${FONT}:textfile=${txt}:x=(w-text_w)/2:line_spacing=10:enable='between(t,${c.t0},${c.t1})'`;
    if (hook) {
      parts.push(
        `drawtext=${common}:fontcolor=white:fontsize=54:box=1:boxcolor=${accent}:boxborderw=20:y=1380`
      );
    } else {
      parts.push(
        `drawtext=${common}:fontcolor=white:fontsize=42:borderw=6:bordercolor=black@0.55:y=1470`
      );
    }
  });
  return parts.join(",");
}

// Intermediate segments stay local — speed over size.
const ENC_SEG = [
  "-c:v", "libx264",
  "-preset", "ultrafast",
  "-crf", "18",
  "-r", "30",
];
// Final output gets uploaded — compress properly and cap the bitrate so a
// 60s reel can never exceed the storage tier's 50MB per-file limit.
const ENC_FINAL = [
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-threads", "2",
  "-crf", "21",
  "-maxrate", "6M",
  "-bufsize", "12M",
  "-r", "30",
];

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
    if (!edl) continue;
    // Only pieces awaiting a render (fresh or revised) get re-rendered; to
    // force a full re-render, set piece statuses to 'rendering' first.
    const hasVideo =
      piece.render_asset_id &&
      assetPath[piece.render_asset_id]?.endsWith(".mp4");
    if (piece.status !== "rendering" && hasVideo) continue;
    // Normalize: a single cut is a one-segment montage.
    const segments = (
      edl.segments?.length
        ? edl.segments
        : [{ asset_id: edl.asset_id, in: edl.in, out: edl.out }]
    ).filter(
      (seg) =>
        seg?.asset_id &&
        byId[seg.asset_id] &&
        Number.isFinite(seg.in) &&
        Number.isFinite(seg.out) &&
        seg.out > seg.in
    );
    if (!segments.length) continue;

    await withTmp(async (dir) => {
      // Download each distinct source once.
      const local = {};
      const info = {};
      for (const seg of segments) {
        if (!local[seg.asset_id]) {
          local[seg.asset_id] = await downloadTo(
            byId[seg.asset_id].storage_path,
            join(dir, `src-${seg.asset_id}.mp4`)
          );
          info[seg.asset_id] = await probe(local[seg.asset_id]);
        }
      }

      // Pass 1: normalize every segment (uniform video + audio).
      const segFiles = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const inf = info[seg.asset_id];
        const dur = seg.out - seg.in;
        const out = join(dir, `seg${i}.mp4`);
        const geo = geometryFilter(
          inf.width ?? 1920,
          inf.height ?? 1080,
          seg.crop ?? edl.crop
        );
        const args = ["-y", "-ss", String(seg.in), "-t", String(dur), "-i", local[seg.asset_id]];
        if (!inf.hasAudio) {
          args.push("-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=48000:cl=stereo");
          args.push("-map", "0:v:0", "-map", "1:a:0");
        }
        args.push("-vf", `${geo},fps=30,format=yuv420p`);
        args.push("-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "128k");
        args.push(...ENC_SEG, "-shortest", out);
        await ffmpegRun(args);
        segFiles.push(out);
      }
      // Pass 2: join with transitions, then captions + fades + loudnorm.
      const XFADE = {
        cut: ["fade", 0.06], // imperceptible — reads as a hard cut
        fade: ["fade", 0.25],
        slideleft: ["slideleft", 0.3],
        slideright: ["slideright", 0.3],
        circleopen: ["circleopen", 0.3],
      };
      const durs = segments.map((seg) => seg.out - seg.in);
      const out = join(dir, "out.mp4");

      if (segFiles.length === 1) {
        const totalDur = durs[0];
        await ffmpegRun([
          "-y", "-i", segFiles[0],
          "-vf", overlayFilter({ edl, totalDur, accentHex: coach.accent_hex, dir, writeFileSync }),
          "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
          "-c:a", "aac", "-b:a", "128k",
          ...ENC_FINAL,
          "-movflags", "+faststart",
          out,
        ]);
      } else {
        const graph = [];
        let acc = durs[0];
        let vPrev = "0:v";
        let aPrev = "0:a";
        for (let i = 1; i < segFiles.length; i++) {
          const [type, fd] =
            XFADE[segments[i - 1].transition] ?? XFADE.fade;
          const offset = Math.max(0, acc - fd).toFixed(3);
          graph.push(
            `[${vPrev}][${i}:v]xfade=transition=${type}:duration=${fd}:offset=${offset}[v${i}]`
          );
          graph.push(`[${aPrev}][${i}:a]acrossfade=d=${fd}[a${i}]`);
          vPrev = `v${i}`;
          aPrev = `a${i}`;
          acc = acc - fd + durs[i];
        }
        const totalDur = acc;
        graph.push(
          `[${vPrev}]${overlayFilter({ edl, totalDur, accentHex: coach.accent_hex, dir, writeFileSync })}[vout]`
        );
        graph.push(`[${aPrev}]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
        await ffmpegRun([
          "-y",
          ...segFiles.flatMap((f) => ["-i", f]),
          "-filter_complex", graph.join(";"),
          "-map", "[vout]",
          "-map", "[aout]",
          "-c:a", "aac", "-b:a", "128k",
          ...ENC_FINAL,
          "-movflags", "+faststart",
          out,
        ]);
      }
      const totalDur = durs.reduce((a, d) => a + d, 0);

      const folder = byId[segments[0].asset_id].storage_path
        .split("/")
        .slice(0, 2)
        .join("/");
      const storagePath = `${folder}/renders/${piece.id}.mp4`;
      await uploadFrom(out, storagePath, "video/mp4");

      const { data: videoAsset, error: vaErr } = await db
        .from("media_assets")
        .insert({
          session_id: session.id,
          storage_path: storagePath,
          kind: "render",
          duration_sec: totalDur,
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
      console.log(`  rendered piece ${piece.id} (${segments.length} segment${segments.length === 1 ? "" : "s"})`);
    });
  }

  return null; // pipeline complete — session becomes ready
}

/* ——— Revise: the coach's notes on a finished piece → re-edit ——— */
export async function revise({ session }) {
  const coach = await loadCoach(session);
  const assets = await loadAssets(session.id);
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

  const { data: pieces, error } = await db
    .from("content_pieces")
    .select("*")
    .eq("session_id", session.id)
    .not("revision_note", "is", null);
  if (error) throw new Error(`load revisions: ${error.message}`);
  if (!pieces?.length) return "render";

  const assetList = assets
    .map(
      (a) =>
        `${a.id} · ${Math.round(a.duration_sec ?? 0)}s · ${(a.width ?? 0) > (a.height ?? 0) ? "landscape" : "vertical"}`
    )
    .join("\n");

  for (const piece of pieces) {
    const prompt = [
      `You are the coach's video editor applying their revision notes to an`,
      `existing finished piece. Coach: ${coach.name}; sport=${coach.sport};`,
      `tones=${(coach.tones ?? []).join(", ")}; mission=${coach.mission}.`,
      coach.voice_memo_transcript
        ? `How the coach talks: "${coach.voice_memo_transcript.slice(0, 800)}"`
        : ``,
      ``,
      `THE CURRENT PIECE (format=${piece.format}):`,
      JSON.stringify(
        {
          edl: piece.edl,
          hook: piece.hook,
          caption: piece.caption,
          hashtags: piece.hashtags,
          cta: piece.cta,
        },
        null,
        1
      ),
      ``,
      `SOURCE VIDEOS AVAILABLE (id · duration · orientation):`,
      assetList,
      ``,
      `THE COACH'S REVISION REQUEST — apply it precisely, change nothing they`,
      `didn't ask about:`,
      `"${String(piece.revision_note).slice(0, 600)}"`,
      ``,
      `Rules: cuts may move anywhere inside the source durations. Stories max`,
      `15s, reels max 60s. Caption beats stay inside the cut (t=0 = start).`,
      `Multi-segment pieces keep 1.5-6s segments with a "transition" per`,
      `segment from: cut|fade|slideleft|slideright|circleopen.`,
      ``,
      `Return ONLY this JSON object (same shape as the current piece):`,
      `{"edl": {"segments": [{"asset_id": "...", "in": 0, "out": 3, "transition": "cut"}, ...]`,
      `         OR {"asset_id": "...", "in": 0, "out": 12} for a single cut,`,
      `  "crop": {"mode": "center|eased", "start_x_frac": 0.5},`,
      `  "captions": [{"text": "...", "t0": 0, "t1": 2.4, "style": "hook|body"}]},`,
      ` "hook": "...", "caption": "...", "hashtags": "...", "cta": "...",`,
      ` "why": "one sentence on what you changed"}`,
    ].join("\n");

    const reply = await askClaude({
      system:
        "You are a precise short-form video editor. You apply the coach's notes faithfully and only ever reply with valid JSON.",
      content: [{ type: "text", text: prompt }],
      maxTokens: 4000,
    });
    const draft = extractJson(reply);

    // Normalize + clamp the revised cut.
    const TRANSITIONS = ["cut", "fade", "slideleft", "slideright", "circleopen"];
    const maxLen = piece.format === "story" ? 15 : 60;
    const rawSegs = draft.edl?.segments?.length
      ? draft.edl.segments
      : [{ asset_id: draft.edl?.asset_id, in: draft.edl?.in, out: draft.edl?.out }];
    let total = 0;
    const segments = rawSegs
      .map((seg) => {
        const asset = byId[seg.asset_id] ?? byId[piece.edl?.asset_id];
        if (!asset) return null;
        const hi = asset.duration_sec ?? Number(seg.out);
        const start = Math.max(0, Math.min(Number(seg.in) || 0, hi - 1));
        const end = Math.min(hi, Math.max(start + 1, Number(seg.out) || start + 1));
        if (!(end - start >= 1)) return null;
        return {
          asset_id: asset.id,
          in: start,
          out: end,
          transition: TRANSITIONS.includes(seg.transition) ? seg.transition : "cut",
        };
      })
      .filter(Boolean)
      .filter((seg) => {
        if (total >= maxLen) return false;
        total += seg.out - seg.in;
        return true;
      });
    if (!segments.length) {
      console.warn(`revision for piece ${piece.id} produced no usable cut — skipped`);
      await db
        .from("content_pieces")
        .update({ revision_note: null, status: "ready" })
        .eq("id", piece.id);
      continue;
    }

    const captions = (draft.edl?.captions ?? [])
      .filter((c) => c.text)
      .map((c) => ({
        text: String(c.text).slice(0, 80),
        t0: Math.max(0, Math.min(Number(c.t0) || 0, total)),
        t1: Math.max(0, Math.min(Number(c.t1) || 0, total)),
        style: c.style === "hook" ? "hook" : "body",
      }))
      .filter((c) => c.t1 > c.t0);

    const single = segments.length === 1;
    const newEdl = {
      ...(single
        ? { asset_id: segments[0].asset_id, in: segments[0].in, out: segments[0].out }
        : { segments }),
      type: piece.edl?.type,
      poster_asset_id: piece.edl?.poster_asset_id,
      crop: {
        mode: draft.edl?.crop?.mode === "eased" ? "eased" : "center",
        start_x_frac: Number(draft.edl?.crop?.start_x_frac ?? 0.5),
      },
      captions,
    };

    const { error: upErr } = await db
      .from("content_pieces")
      .update({
        edl: newEdl,
        hook: String(draft.hook ?? piece.hook ?? "").slice(0, 200),
        caption: String(draft.caption ?? piece.caption ?? "").slice(0, 2000),
        hashtags: String(draft.hashtags ?? piece.hashtags ?? "").slice(0, 300),
        cta: String(draft.cta ?? piece.cta ?? "").slice(0, 300),
        why: String(draft.why ?? "Revised per your note.").slice(0, 500),
        status: "rendering",
        revision_note: null,
      })
      .eq("id", piece.id);
    if (upErr) throw new Error(`apply revision: ${upErr.message}`);
    console.log(`  revised piece ${piece.id}`);
  }

  return "render";
}

/* ——— Cleanup: free storage from artifacts and orphaned renders ——— */
export async function cleanup() {
  const chunks = (arr, n) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
      arr.slice(i * n, i * n + n)
    );
  let removed = 0;

  // Orphaned render files: assets no piece references anymore (old
  // re-renders, deleted reels).
  const { data: renders } = await db
    .from("media_assets")
    .select("id, storage_path")
    .eq("kind", "render");
  const { data: pieces } = await db
    .from("content_pieces")
    .select("render_asset_id, edl");
  const referenced = new Set();
  for (const p of pieces ?? []) {
    if (p.render_asset_id) referenced.add(p.render_asset_id);
    if (p.edl?.poster_asset_id) referenced.add(p.edl.poster_asset_id);
  }
  const orphans = (renders ?? []).filter((r) => !referenced.has(r.id));
  for (const batch of chunks(orphans, 100)) {
    await db.storage.from("raw").remove(batch.map((o) => o.storage_path));
    await db
      .from("media_assets")
      .delete()
      .in("id", batch.map((o) => o.id));
    removed += batch.length;
  }

  // Intermediate artifacts (wav + transcript) of finished sessions.
  const { data: done } = await db
    .from("sessions")
    .select("id")
    .in("status", ["ready", "failed"]);
  const doneIds = (done ?? []).map((s) => s.id);
  if (doneIds.length) {
    const { data: raws } = await db
      .from("media_assets")
      .select("id, storage_path")
      .eq("kind", "raw")
      .in("session_id", doneIds);
    const paths = (raws ?? []).flatMap((a) => [
      artifactPath(a, "wav"),
      artifactPath(a, "transcript.json"),
    ]);
    for (const batch of chunks(paths, 100)) {
      await db.storage.from("raw").remove(batch);
      removed += batch.length;
    }
  }

  console.log(`cleanup done — removed up to ${removed} files`);
  return null;
}

export const STAGES = { ingest, transcribe, understand, compose, render, revise, cleanup };
