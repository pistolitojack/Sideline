import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function probe(localPath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    localPath,
  ]);
  const info = JSON.parse(stdout);
  const video = info.streams?.find((s) => s.codec_type === "video");
  const audio = info.streams?.find((s) => s.codec_type === "audio");
  return {
    duration: Number(info.format?.duration) || null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: Boolean(audio),
  };
}

export async function extractAudioWav(localPath, outPath) {
  await run("ffmpeg", [
    "-y", "-i", localPath,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    outPath,
  ]);
  return outPath;
}

// Sample frames ~1 per 2s, capped at maxFrames, resized to 512px wide.
// Returns [{ path, t }] with the timestamp each frame represents.
export async function sampleFrames(localPath, duration, outDir, maxFrames = 30) {
  const interval = Math.max(2, (duration || 60) / maxFrames);
  await run("ffmpeg", [
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

export async function posterFrame(localPath, atSeconds, outPath) {
  await run("ffmpeg", [
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
