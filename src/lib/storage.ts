import { createClient } from "@supabase/supabase-js";

const BUCKET = "punch-photos";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, serviceRoleKey);
}

/**
 * Punch photo storage via Supabase Storage (private bucket, server-side
 * access only via the service role key). Vercel's serverless functions
 * don't have a writable/persistent local filesystem, so this can't be a
 * plain disk write like early local dev used.
 */
export async function savePunchPhoto(punchId: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Invalid photo data URL");
  const [, ext, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const normalizedExt = ext === "jpeg" ? "jpg" : ext;
  const filename = `${punchId}.${normalizedExt}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: `image/${normalizedExt === "jpg" ? "jpeg" : normalizedExt}`,
    upsert: true,
  });
  if (error) throw error;

  return filename;
}

export async function readPunchPhoto(filename: string): Promise<Buffer> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(filename);
  if (error || !data) throw error ?? new Error("Photo not found");
  return Buffer.from(await data.arrayBuffer());
}
