import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { savePunchPhoto } from "@/lib/storage";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
  const photoDataUrl = typeof body?.photoDataUrl === "string" ? body.photoDataUrl : null;
  const requestedType: "IN" | "OUT" | null =
    body?.type === "IN" || body?.type === "OUT" ? body.type : null;

  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin, employeeId);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  if (deviceId) {
    await prisma.device.upsert({
      where: { id: deviceId },
      update: {},
      create: { id: deviceId, label: `Unregistered device (${deviceId.slice(0, 8)})` },
    });
  }

  // The employee explicitly picks Time In/Out on the kiosk now (rather than
  // a silent auto-toggle), so an explicit choice is honored here. Only when
  // none is given (e.g. an older queued offline punch) do we fall back to
  // auto-deriving it from the last punch.
  let type: "IN" | "OUT";
  if (requestedType) {
    type = requestedType;
  } else {
    const lastPunch = await prisma.punch.findFirst({
      where: { employeeId: matched.id },
      orderBy: { timestamp: "desc" },
    });
    type = lastPunch?.type === "IN" ? "OUT" : "IN";
  }

  const punch = await prisma.punch.create({
    data: {
      employeeId: matched.id,
      type,
      deviceId: deviceId ?? undefined,
      timestamp: new Date(),
    },
  });

  if (photoDataUrl) {
    try {
      const photoPath = await savePunchPhoto(punch.id, photoDataUrl);
      await prisma.punch.update({ where: { id: punch.id }, data: { photoPath } });
    } catch (err) {
      // Photo capture failing should never lose the punch itself.
      console.error("[punch] photo save failed:", err);
    }
  }

  return NextResponse.json({
    employeeName: matched.name,
    type,
    timestamp: punch.timestamp,
  });
}
