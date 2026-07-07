import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set them in the worker's environment."
  );
  process.exit(1);
}

// Service-role client: bypasses RLS. This key must NEVER ship to a browser.
export const db = createClient(url, key, {
  auth: { persistSession: false },
});

const BUCKET = "raw";

export async function downloadTo(storagePath, localPath) {
  const { data, error } = await db.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`download ${storagePath}: ${error.message}`);
  // Stream to disk — big source videos must never sit in memory.
  await pipeline(Readable.fromWeb(data.stream()), createWriteStream(localPath));
  return localPath;
}

export async function uploadFrom(localPath, storagePath, contentType) {
  const body = await readFile(localPath);
  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
  return storagePath;
}

export async function uploadJson(obj, storagePath) {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(JSON.stringify(obj)), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
  return storagePath;
}

export async function downloadJson(storagePath) {
  const { data, error } = await db.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`download ${storagePath}: ${error.message}`);
  return JSON.parse(await data.text());
}
