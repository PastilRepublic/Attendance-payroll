import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.join(process.cwd(), "storage", "punch-photos");

/**
 * Local-filesystem photo storage for Phase 1. Swap this file for a cloud
 * blob implementation (e.g. Vercel Blob, S3) at deploy time without
 * touching any caller.
 */
export async function savePunchPhoto(punchId: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Invalid photo data URL");
  const [, ext, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  await mkdir(STORAGE_ROOT, { recursive: true });
  const filename = `${punchId}.${ext === "jpeg" ? "jpg" : ext}`;
  await writeFile(path.join(STORAGE_ROOT, filename), buffer);

  return filename;
}

export async function readPunchPhoto(filename: string): Promise<Buffer> {
  return readFile(path.join(STORAGE_ROOT, filename));
}
