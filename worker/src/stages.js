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
  return "direct";
}

/* ——— Stage: the DIRECTOR — looks at the footage + coach + optional prompt
   and writes the session's content plan. This is the brain: it decides what
   kinds of pieces to make, clusters same-drill videos, and hands the plan to
   the composer. Runs after ingest, before transcribe. ——— */
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const clampNum = (n, lo, hi, dflt) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;

const DIRECTOR_SCHEMA = [
  "Return ONE JSON object, nothing else, with EXACTLY these fields:",
  "{",
  '  "read_of_footage": "2-4 sentences: what is in the videos and how they',
  "    relate — same drill or different? multiple camera angles of the SAME",
  '    action, or one angle each? any progression/story across the clips?",',
  '  "clusters": [',
  '    {"cluster_id": "c1", "label": "short human label e.g. sled push drill",',
  '     "video_ids": ["<the EXACT asset_id of each video in this group>"],',
  '     "angle_variety_score": 0.0}',
  "  ],",
  '  "director_notes": "one short paragraph in the coach\'s voice: what you are',
  '    going to make and why, given the footage and their request",',
  '  "planned_pieces": [',
  "    {",
  '      "piece_id": "p1",',
  '      "kind": "one of: single, montage, teaching, transformation,',
  "        testimonial, pov, story, funny_moment — or a close variant that",
  '        fits the footage better",',
  '      "cluster_ids_to_use": ["c1"],   // [] means any footage will do',
  '      "target_length_sec": 25,        // 15-45',
  '      "structural_recipe": "human-readable shot plan the editor follows,',
  "        e.g. hook (1s) -> wide establishing -> tight punch on the payoff ->",
  "        outro; OR A/B/A multi-angle cut between two clips of the same rep;",
  '        OR montage of 6 fast beats across all clips",',
  '      "why_this_piece": "ONE line, coach\'s voice, why this piece deserves',
  '        to exist for their mission/request"',
  "    }",
  "  ]",
  "}",
  "",
  "HARD RULES:",
  "- angle_variety_score = how many DIFFERENT camera angles of the SAME action",
  "  exist in a cluster. One angle only = 0.0-0.3. Two clear angles of the",
  "  same rep = 0.5+.",
  "- A teaching or multi-angle piece REQUIRES a cluster with",
  "  angle_variety_score >= 0.4. If NO cluster reaches that, DO NOT plan one —",
  "  plan something the footage can actually deliver (single, montage, story).",
  "- Never plan more pieces than the footage supports. Two short single-angle",
  "  clips → 1-2 pieces, not 5. Normally 3-5 pieces when the footage allows.",
  "- If the coach gave a request, it OVERRIDES variety — make what they asked.",
  "- If no request, make a VARIED pack — do not repeat the same kind.",
  "- EVERY piece MUST have a real why_this_piece (no empty strings).",
  "- Use the EXACT asset_id strings shown above. Never invent ids.",
].join("\n");

function normalizePlan(raw, assets) {
  const ids = new Set(assets.map((a) => a.id));
  const clusters = (Array.isArray(raw?.clusters) ? raw.clusters : [])
    .map((c, i) => ({
      cluster_id: String(c?.cluster_id || `c${i + 1}`),
      label: String(c?.label || "clip").slice(0, 80),
      video_ids: (Array.isArray(c?.video_ids) ? c.video_ids : []).filter((v) =>
        ids.has(v)
      ),
      angle_variety_score: clamp01(Number(c?.angle_variety_score)),
    }))
    .filter((c) => c.video_ids.length);
  const clusterIds = new Set(clusters.map((c) => c.cluster_id));

  const maxPieces = Math.max(1, Math.min(5, assets.length + 2));
  let pieces = (Array.isArray(raw?.planned_pieces) ? raw.planned_pieces : [])
    .map((p, i) => ({
      piece_id: String(p?.piece_id || `p${i + 1}`),
      kind: String(p?.kind || "single")
        .toLowerCase()
        .replace(/[^a-z_]/g, "")
        .slice(0, 40) || "single",
      cluster_ids_to_use: (Array.isArray(p?.cluster_ids_to_use)
        ? p.cluster_ids_to_use
        : []
      ).filter((c) => clusterIds.has(c)),
      target_length_sec: clampNum(Number(p?.target_length_sec), 10, 45, 25),
      structural_recipe: String(p?.structural_recipe || "").slice(0, 600),
      why_this_piece: String(p?.why_this_piece || "").slice(0, 300),
    }))
    .slice(0, maxPieces);

  if (!pieces.length) {
    pieces = [
      {
        piece_id: "p1",
        kind: assets.length > 1 ? "montage" : "single",
        cluster_ids_to_use: [],
        target_length_sec: 25,
        structural_recipe:
          "hook on the strongest moment → the action → the payoff → outro",
        why_this_piece: "The best moment from today's footage, cut clean.",
      },
    ];
  }
  for (const p of pieces) {
    if (!p.why_this_piece)
      p.why_this_piece = "A strong piece from today's session.";
  }

  return {
    read_of_footage: String(raw?.read_of_footage || "").slice(0, 900),
    clusters,
    director_notes: String(raw?.director_notes || "").slice(0, 900),
    planned_pieces: pieces,
  };
}

export async function direct({ session }) {
  const assets = await loadAssets(session.id);
  const coach = await loadCoach(session);
  const prompt = String(session.prompt ?? session.brief ?? "").trim();
  const framesPer = assets.length > 4 ? 3 : 4;

  const content = [
    {
      type: "text",
      text:
        "You are the creative DIRECTOR. Below are a few frames sampled from " +
        "each video the coach just uploaded. Decide what short-form pieces to " +
        "make. Study the frames carefully before planning.",
    },
  ];

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    await withTmp(async (dir) => {
      const local = await downloadTo(a.storage_path, join(dir, "in.mp4"));
      const frames = await sampleFrames(local, a.duration_sec, dir, framesPer);
      content.push({
        type: "text",
        text: `VIDEO ${i + 1} — asset_id: ${a.id} — duration: ${
          a.duration_sec ? a.duration_sec.toFixed(1) : "?"
        }s`,
      });
      for (const f of frames) {
        content.push({ type: "text", text: `  frame at t=${f.t}s:` });
        content.push(await imageBlock(f.path));
      }
    });
  }

  content.push({
    type: "text",
    text: [
      "THE COACH:",
      `- sport / focus: ${coach.sport ?? "?"}`,
      `- audience: ${coach.audience ?? "?"}`,
      `- mission right now: ${coach.mission ?? "?"}`,
      `- city: ${coach.city ?? "not set"}`,
      coach.ig_profile
        ? `- their Instagram brand: ${String(coach.ig_profile).slice(0, 800)}`
        : "- Instagram brand: not scanned",
    ].join("\n"),
  });

  content.push({
    type: "text",
    text: prompt
      ? `THE COACH'S REQUEST FOR THIS UPLOAD (TOP PRIORITY — honor it above everything): "${prompt.slice(
          0,
          500
        )}"`
      : "THE COACH GAVE NO REQUEST — you decide. Build a VARIED pack that serves their mission; mix the kinds, don't repeat one kind.",
  });

  content.push({ type: "text", text: DIRECTOR_SCHEMA });

  const reply = await askClaude({
    system:
      "You are a world-class short-form video creative director for sports " +
      "coaches. You reply with exactly one JSON object and no other text.",
    content,
    maxTokens: 4000,
  });
  const plan = normalizePlan(extractJson(reply), assets);

  const { error: planErr } = await db
    .from("sessions")
    .update({ plan })
    .eq("id", session.id);
  if (planErr) throw new Error(`save plan: ${planErr.message}`);

  // Tag each asset with the cluster the director assigned it.
  const clusterOf = {};
  for (const c of plan.clusters)
    for (const vid of c.video_ids)
      clusterOf[vid] = { id: c.cluster_id, label: c.label };
  for (const a of assets) {
    const c = clusterOf[a.id];
    if (c) {
      const { error: tagErr } = await db
        .from("media_assets")
        .update({ cluster_id: c.id, cluster_label: c.label })
        .eq("id", a.id);
      if (tagErr) console.warn(`  cluster tag failed ${a.id}: ${tagErr.message}`);
    }
  }

  console.log(
    `  directed ${plan.planned_pieces.length} piece(s) from ${assets.length} video(s)`
  );
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
          session.prompt ?? session.brief
            ? `THE COACH'S NOTE FOR THIS SESSION (top priority, honor it): "${String(session.prompt ?? session.brief).slice(0, 500)}"`
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

// Scan the coach's public Instagram (needs APIFY_TOKEN) and distill it into a
// brand brief the writers use. Re-scans when the last scan is missing or older
// than 30 days so the brief stays current. Fails soft — no scan, no problem,
// and a failed scan leaves scanned_at untouched so the next session retries.
const IG_RESCAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
async function ensureIgProfile(coach) {
  if (!coach.ig_handle || !process.env.APIFY_TOKEN) return;
  const scannedMs = coach.scanned_at ? new Date(coach.scanned_at).getTime() : 0;
  if (scannedMs && Date.now() - scannedMs < IG_RESCAN_MS) return; // fresh enough
  try {
    const handle = String(coach.ig_handle).replace(/^@/, "").trim();
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=120`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [handle] }),
      }
    );
    if (!res.ok) throw new Error(`apify ${res.status}`);
    const items = await res.json();
    const p = Array.isArray(items) ? items[0] : null;
    if (!p) throw new Error("profile not found");
    const posts = (p.latestPosts ?? []).slice(0, 12).map((x) => ({
      caption: String(x.caption ?? "").slice(0, 300),
      likes: x.likesCount,
      comments: x.commentsCount,
      type: x.type,
    }));
    const reply = await askClaude({
      system:
        "You distill social profiles into concise brand briefs for ghostwriters. Reply with plain text only.",
      content: [
        {
          type: "text",
          text: [
            `Summarize this coach's Instagram in under 180 words for a ghostwriter:`,
            `what they post, caption style (length, emoji use, phrasing),`,
            `recurring themes, and which posts perform best and why.`,
            `Bio: ${p.biography ?? ""}`,
            `Followers: ${p.followersCount ?? "?"}`,
            `Recent posts: ${JSON.stringify(posts)}`,
          ].join("\n"),
        },
      ],
      maxTokens: 600,
    });
    const summary = reply.trim().slice(0, 2000);
    const scannedAt = new Date().toISOString();
    await db
      .from("coaches")
      .update({ ig_profile: summary, scanned_at: scannedAt })
      .eq("id", coach.id);
    coach.ig_profile = summary;
    coach.scanned_at = scannedAt;
    console.log(`  scanned IG @${handle}`);
  } catch (e) {
    console.warn(`ig scan skipped: ${e.message}`);
  }
}

/* ——— Stage 4: Claude writes each piece (EDL + copy) ——— */
export async function compose({ session }) {
  const coach = await loadCoach(session);
  await ensureIgProfile(coach);
  const assets = await loadAssets(session.id);
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

  const { data: allMoments, error } = await db
    .from("moments")
    .select("*")
    .eq("session_id", session.id)
    .gte("score", 0.4)
    .order("score", { ascending: false });
  if (error) throw new Error(`load moments: ${error.message}`);
  if (!allMoments?.length) throw new Error("no usable moments found");

  // The DIRECTOR's plan decides what to make; the composer no longer picks.
  // Fall back to a single piece if a plan is somehow missing (old session).
  const plan =
    session.plan && Array.isArray(session.plan.planned_pieces)
      ? session.plan
      : {
          clusters: [],
          planned_pieces: [
            {
              piece_id: "p1",
              kind: assets.length > 1 ? "montage" : "single",
              cluster_ids_to_use: [],
              target_length_sec: 25,
              structural_recipe:
                "hook on the strongest moment → the action → the payoff → outro",
              why_this_piece: "The best of today's footage, cut clean.",
            },
          ],
        };

  const clusterAssets = {}; // cluster_id -> Set(asset_id)
  for (const c of plan.clusters ?? [])
    clusterAssets[c.cluster_id] = new Set(c.video_ids);

  let made = 0;
  for (const pp of plan.planned_pieces.slice(0, 6)) {
    try {
      const ok = await composePlannedPiece({
        session,
        coach,
        byId,
        allMoments,
        pp,
        clusterAssets,
      });
      if (ok) made++;
    } catch (e) {
      // One bad piece never sinks the rest of the pack.
      console.warn(`  piece ${pp.piece_id} skipped: ${e.message}`);
    }
  }
  if (!made) throw new Error("no planned piece could be composed");
  return "render";
}

// Build ONE content piece from ONE of the director's planned pieces: pick the
// moments from the piece's cluster(s), ask Claude to realize the structural
// recipe as a concrete EDL + copy, extract a poster, and insert the piece.
async function composePlannedPiece({
  session,
  coach,
  byId,
  allMoments,
  pp,
  clusterAssets,
}) {
  // Which moments may this piece draw from?
  let pool = allMoments;
  if (pp.cluster_ids_to_use?.length) {
    const allowed = new Set();
    for (const cid of pp.cluster_ids_to_use)
      for (const aid of clusterAssets[cid] ?? []) allowed.add(aid);
    const filtered = allMoments.filter((m) => allowed.has(m.asset_id));
    if (filtered.length) pool = filtered;
  }
  pool = pool.slice(0, 16);
  if (!pool.length) return false;

  const momentList = pool
    .map((m, i) => {
      const a = byId[m.asset_id];
      const landscape = (a?.width ?? 0) > (a?.height ?? 0);
      return `#${i} · asset=${m.asset_id} · ${m.t_start.toFixed(
        1
      )}s→${m.t_end.toFixed(1)}s (${(m.t_end - m.t_start).toFixed(1)}s) · ${
        landscape ? "landscape" : "vertical"
      } source · ${m.type} · ${m.reason} · said: "${(
        m.transcript_span || "(no speech)"
      ).slice(0, 200)}"`;
    })
    .join("\n");

  const multi = String(pp.kind) !== "single";
  const target = clampNum(Number(pp.target_length_sec), 8, 60, 25);

  const prompt = [
    `You are the coach's editor + ghostwriter. Build the ONE piece the DIRECTOR asked for below.`,
    `Coach: name=${coach.name}; sport=${coach.sport}; tones=${(
      coach.tones ?? []
    ).join(", ")}; audience=${coach.audience}; mission=${coach.mission}.`,
    coach.voice_memo_transcript
      ? `VOICE SAMPLE — copy STYLE only (tone, rhythm, word length), NEVER its topic or examples: "${coach.voice_memo_transcript.slice(
          0,
          900
        )}"`
      : `(No voice memo — write plain, direct, no corporate tone.)`,
    coach.ig_profile
      ? `Their real Instagram vibe: ${String(coach.ig_profile).slice(0, 1200)}`
      : ``,
    ``,
    `THE DIRECTOR'S BRIEF FOR THIS PIECE (follow it):`,
    `- kind: ${pp.kind}`,
    `- why it exists (keep this intent alive in the copy): ${pp.why_this_piece}`,
    `- target length: ~${target}s`,
    `- structural recipe to realize: ${pp.structural_recipe}`,
    ``,
    `Available moments — pick sub-ranges from INSIDE these (use the index numbers):`,
    momentList,
    ``,
    multi
      ? `Build ${
          target < 20 ? "3-6" : "5-10"
        } segments across the moments that realize the recipe. Each segment names the transition INTO the next: "cut" (hard cut, default), "fade" (mood shift), "slideleft"/"slideright" (whip to new angle), "circleopen" (reveal). Mostly cuts and fades; at most 1-2 specialty wipes.`
      : `Build exactly ONE segment — a single clean cut that realizes the recipe (hook early, land the payoff).`,
    `Aim for ~${target}s total, never over 60s. Multi-clip segments run 1-6s each; a single cut may run longer.`,
    `Write the copy in the coach's voice, shaped by the kind and the intent above.`,
    `Caption beats land inside the cut (t=0 = cut start): a hook beat in the first 2-3s, then 1-3 body beats.`,
    ``,
    `Return ONLY one JSON object:`,
    `{"segments": [{"moment_index": 0, "in": <abs s>, "out": <abs s>, "transition": "cut"}],`,
    ` "captions": [{"text":"HOOK.","t0":0,"t1":2.2,"style":"hook"},{"text":"body beat","t0":3,"t1":6,"style":"body"}],`,
    ` "hook":"...", "caption":"1-4 sentences in the coach's voice", "hashtags":"#four #to #six #tags",`,
    ` "cta":"aimed at the coach's mission", "suggested_slot":"Tue 6:00 PM",`,
    ` "suggested_sound":"a style of trending sound, never a specific song"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const reply = await askClaude({
    system:
      "You are an elite short-form sports video editor and ghostwriter. You realize the director's recipe precisely and reply with exactly one valid JSON object.",
    content: [{ type: "text", text: prompt }],
    maxTokens: 3000,
  });
  const draft = extractJson(reply);

  const TRANSITIONS = ["cut", "fade", "slideleft", "slideright", "circleopen"];
  let total = 0;
  const segments = (Array.isArray(draft.segments) ? draft.segments : [])
    .map((seg) => {
      const m = pool[Number(seg.moment_index)];
      if (!m) return null;
      const a = byId[m.asset_id];
      const lo = Math.max(0, m.t_start - 1);
      const hi = Math.min(m.t_end + 1, a?.duration_sec ?? m.t_end + 1);
      const start = Math.max(lo, Math.min(Number(seg.in), hi - 1));
      const perSegCap = multi ? 6 : 60;
      const end = Math.min(
        hi,
        Math.max(start + 1, Math.min(Number(seg.out), start + perSegCap))
      );
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 1)
        return null;
      return {
        asset_id: m.asset_id,
        in: start,
        out: end,
        transition: TRANSITIONS.includes(seg.transition)
          ? seg.transition
          : "cut",
      };
    })
    .filter(Boolean)
    .filter((seg) => {
      if (total >= 60) return false;
      total += seg.out - seg.in;
      return true;
    });
  if (!segments.length) return false;

  const captions = (Array.isArray(draft.captions) ? draft.captions : [])
    .filter((c) => c.text)
    .map((c) => ({
      text: String(c.text).slice(0, 80),
      t0: Math.max(0, Math.min(Number(c.t0) || 0, total)),
      t1: Math.max(0, Math.min(Number(c.t1) || 0, total)),
      style: c.style === "hook" ? "hook" : "body",
    }))
    .filter((c) => c.t1 > c.t0);

  // Poster from the opening segment → media_assets(kind render).
  const first = segments[0];
  const firstAsset = byId[first.asset_id];
  const folder = firstAsset.storage_path.split("/").slice(0, 2).join("/");
  const posterStorage = `${folder}/posters/${session.id}-${pp.piece_id}.jpg`;
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
  if (posterErr) throw new Error(`poster asset: ${posterErr.message}`);

  const isMulti = segments.length > 1;
  const { error: insErr } = await db.from("content_pieces").insert({
    session_id: session.id,
    format: "reel",
    edl: {
      segments,
      type: pp.kind,
      crop: {
        mode: isMulti ? "center" : "eased",
        start_x_frac: 0.5,
      },
      captions,
      poster_asset_id: posterAsset.id,
    },
    // Null until the render stage produces the mp4 — never the poster JPG.
    render_asset_id: null,
    piece_kind: String(pp.kind).slice(0, 40),
    director_intent: String(pp.why_this_piece || "").slice(0, 500),
    hook: String(draft.hook ?? "").slice(0, 200),
    caption: String(draft.caption ?? "").slice(0, 2000),
    hashtags: String(draft.hashtags ?? "").slice(0, 300),
    cta: String(draft.cta ?? "").slice(0, 300),
    why: String(pp.why_this_piece ?? draft.why ?? "").slice(0, 500),
    suggested_slot: String(draft.suggested_slot ?? "").slice(0, 40),
    suggested_sound: String(draft.suggested_sound ?? "").slice(0, 120),
    status: "ready",
  });
  if (insErr) throw new Error(`insert piece: ${insErr.message}`);
  return true;
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
          const [type, baseFd] =
            XFADE[segments[i - 1].transition] ?? XFADE.fade;
          // A crossfade can't be longer than the clips it joins — clamp it to
          // half of each adjacent segment so any recipe (short beats, revised
          // cuts) joins cleanly instead of erroring.
          const fd = Math.max(
            0.05,
            Math.min(baseFd, durs[i - 1] / 2, durs[i] / 2)
          );
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
        ? `Voice sample (STYLE ONLY — copy tone and rhythm, never its topic): "${coach.voice_memo_transcript.slice(0, 800)}"`
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

  // Original raw videos of OLD finished sessions — the biggest storage hog.
  // After a few days the coach won't be revising that session, so the source
  // footage is safe to purge. The finished reels (renders + posters) are
  // separate files and are left untouched.
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldDone } = await db
    .from("sessions")
    .select("id")
    .in("status", ["ready", "failed"])
    .lt("created_at", cutoff);
  const oldIds = (oldDone ?? []).map((s) => s.id);
  if (oldIds.length) {
    const { data: rawVids } = await db
      .from("media_assets")
      .select("storage_path")
      .eq("kind", "raw")
      .in("session_id", oldIds);
    const vidPaths = (rawVids ?? []).map((a) => a.storage_path);
    for (const batch of chunks(vidPaths, 100)) {
      await db.storage.from("raw").remove(batch);
      removed += batch.length;
    }
  }

  console.log(`cleanup done — removed up to ${removed} files`);
  return null;
}

export const STAGES = { ingest, direct, transcribe, understand, compose, render, revise, cleanup };
