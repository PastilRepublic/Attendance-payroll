import { NextResponse } from "next/server";
import { readEmployeePhoto } from "@/lib/storage";

const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/;

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * No auth check, unlike the admin punch-photo route -- the kiosk tablet has
 * no admin session, and needs to render employee photos in its name list.
 * These are low-sensitivity, ID-badge-style photos already visible in
 * person on the shared shop tablet. Also used by the admin Employees UI, so
 * there's one serving path for both consumers.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!SAFE_FILENAME.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const buffer = await readEmployeePhoto(filename);
    const ext = filename.split(".").pop()!.toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // Not immutable like punch-photo -- a re-upload overwrites the same
        // filename (upsert), so a stale long cache would hide the new photo.
        "Cache-Control": "private, max-age=60, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
