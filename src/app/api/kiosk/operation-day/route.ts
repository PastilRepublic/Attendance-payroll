import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getOperationDay, setOperationDay, type OperationDay } from "@/lib/settings";

const VALID: OperationDay[] = ["COOKING", "JAR_FILLING"];

export async function GET() {
  const operationDay = await getOperationDay();
  return NextResponse.json({ operationDay });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const value = body?.operationDay;
  const pin = typeof body?.pin === "string" ? body.pin : null;
  if (!VALID.includes(value)) {
    return NextResponse.json({ error: "Invalid operationDay" }, { status: 400 });
  }
  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { employeeId: matched.id },
    select: { role: true, active: true },
  });
  if (!admin || !admin.active) {
    return NextResponse.json(
      { error: "Only a supervisor or owner can change the operation day" },
      { status: 403 }
    );
  }

  const operationDay = await setOperationDay(value);
  return NextResponse.json({ operationDay });
}
