import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";
import { savePunchPhoto } from "@/lib/storage";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
  const photoDataUrl = typeof body?.photoDataUrl === "string" ? body.photoDataUrl : null;

  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const activeEmployees = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, pinHash: true },
  });

  let matched: { id: string; name: string } | null = null;
  for (const emp of activeEmployees) {
    if (await verifyPin(pin, emp.pinHash)) {
      matched = { id: emp.id, name: emp.name };
      break;
    }
  }

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

  // Re-derive the next punch type server-side at creation time — never trust
  // a client-supplied type, so a stale identify() result can't flip it.
  const lastPunch = await prisma.punch.findFirst({
    where: { employeeId: matched.id },
    orderBy: { timestamp: "desc" },
  });
  const type: "IN" | "OUT" = lastPunch?.type === "IN" ? "OUT" : "IN";

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
