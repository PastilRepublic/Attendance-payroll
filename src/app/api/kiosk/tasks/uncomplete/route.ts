import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";

/**
 * Undoes an accidental tap on the kiosk checklist -- only while the item is
 * still sitting undone-again on screen in the same session. Re-verifies the
 * PIN belongs to whoever actually completed it, same as the complete route.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;
  const taskAssignmentId =
    typeof body?.taskAssignmentId === "string" ? body.taskAssignmentId : null;
  const kind = body?.kind === "SANITATION" ? "SANITATION" : "TASK";

  if (!pin || !taskAssignmentId) {
    return NextResponse.json({ error: "PIN and taskAssignmentId are required" }, { status: 400 });
  }

  if (kind === "SANITATION") {
    const assignment = await prisma.sanitationAssignment.findUnique({
      where: { id: taskAssignmentId },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (assignment.status === "PENDING") {
      return NextResponse.json({ ok: true, alreadyPending: true });
    }
    if (assignment.inspectionResult) {
      return NextResponse.json(
        { error: "Already inspected, cannot undo here" },
        { status: 409 }
      );
    }
    const matched = await resolveEmployeeByPin(pin, employeeId);
    if (!matched || matched.id !== assignment.employeeId) {
      return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
    }
    await prisma.sanitationAssignment.update({
      where: { id: taskAssignmentId },
      data: { employeeId: null, status: "PENDING", completedAt: null },
    });
    return NextResponse.json({ ok: true });
  }

  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: taskAssignmentId },
    include: { employee: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const validPin = await verifyPin(pin, assignment.employee.pinHash);
  if (!validPin || !assignment.employee.active) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  if (assignment.status === "PENDING") {
    return NextResponse.json({ ok: true, alreadyPending: true });
  }
  if (assignment.payslipAdjustmentId) {
    return NextResponse.json(
      { error: "Already applied to a payslip, cannot undo here" },
      { status: 409 }
    );
  }

  await prisma.taskAssignment.update({
    where: { id: taskAssignmentId },
    data: { status: "PENDING", completedAt: null },
  });

  return NextResponse.json({ ok: true });
}
