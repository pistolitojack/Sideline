"use client";

// Resumable uploads to Supabase Storage (SPEC: "uploads go directly to
// Supabase storage (resumable)"). TUS survives flaky gym wifi: a dropped
// connection resumes instead of starting over.

import * as tus from "tus-js-client";
import { createClient } from "./supabase/client";

const CHUNK = 6 * 1024 * 1024; // Supabase requires exactly 6MB chunks

export async function uploadToStorage(
  file: File,
  objectName: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK,
      metadata: {
        bucketName: "raw",
        objectName,
        contentType: file.type || "video/mp4",
        cacheControl: "3600",
      },
      onError: (err) => {
        const msg = String(err);
        if (msg.includes("413") || msg.toLowerCase().includes("maximum")) {
          reject(
            new Error(
              "That video is too large for now — try a shorter clip (under ~50MB)."
            )
          );
        } else {
          reject(
            new Error(
              "The upload dropped and couldn't recover — check your connection and try again."
            )
          );
        }
      },
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}

// Best-effort probe of duration/dimensions in the browser so the DB row is
// useful before the worker's ffprobe pass exists (Phase 4 re-probes properly).
export function probeVideo(
  file: File
): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (d: number | null, w: number | null, h: number | null) => {
      URL.revokeObjectURL(url);
      resolve({ duration: d, width: w, height: h });
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(
        Number.isFinite(video.duration) ? video.duration : null,
        video.videoWidth || null,
        video.videoHeight || null
      );
    video.onerror = () => done(null, null, null);
    setTimeout(() => done(null, null, null), 5000);
    video.src = url;
  });
}

export const prettySize = (bytes: number) =>
  bytes > 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : bytes > 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
