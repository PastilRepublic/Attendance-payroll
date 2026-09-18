import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { logAudit } from "@/lib/audit";

/** Lets an active supervisor/owner waive the pre/post-cooking cleaning gate
 * on a Start Break / Time Out punch (e.g. an employee leaving early for an
 * emergency). Only verifies the PIN and records the override -- the punch
 * itself still goes through the normal punch route afterwards. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;
  const action = body?.action === "BREAK_START" || body?.action === "OUT" ? body.action : null;
  if (!pin || !employeeId || !action) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { employeeId: matched.id },
    select: { id: true, active: true },
  });
  if (!admin || !admin.active) {
    return NextResponse.json(
      { error: "Only a supervisor or owner can skip the cleaning list" },
      { status: 403 }
    );
  }

  await logAudit({
    actorAdminId: admin.id,
    action: "OVERRIDE_SANITATION_GATE",
    targetTable: "Employee",
    targetId: employeeId,
    after: { punch: action },
  });

  return NextResponse.json({ ok: true });
}
