import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";
import { getRequirePhotoOnPunch } from "@/lib/settings";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
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

  const lastPunch = await prisma.punch.findFirst({
    where: { employeeId: matched.id },
    orderBy: { timestamp: "desc" },
  });
  const nextType: "IN" | "OUT" = lastPunch?.type === "IN" ? "OUT" : "IN";

  return NextResponse.json({
    employeeId: matched.id,
    employeeName: matched.name,
    nextType,
    requirePhoto: await getRequirePhotoOnPunch(),
  });
}
