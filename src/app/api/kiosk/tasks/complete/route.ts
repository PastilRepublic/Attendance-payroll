import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getSanitationSettings } from "@/lib/sanitation";
import { savePunchPhoto } from "@/lib/storage";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;
  const taskAssignmentId =
    typeof body?.taskAssignmentId === "string" ? body.taskAssignmentId : null;
  const kind = body?.kind === "SANITATION" ? "SANITATION" : "TASK";
  const photo = body?.photo;

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
    if (assignment.status === "DONE") {
      return NextResponse.json({ ok: true, alreadyDone: true });
    }
    // Any active employee can claim and sign off for the team -- not just
    // whoever (if anyone) was pre-assigned. Re-verify the PIN belongs to a
    // real active employee, never trust a client-supplied id alone.
    const matched = await resolveEmployeeByPin(pin, employeeId);
    if (!matched) {
      return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
    }
    // "Supervisor unavailable" -- nobody is around to check the work, so a
    // photo has to come with the tick.
    let photoUrl: string | undefined;
    if ((await getSanitationSettings()).photoRequired) {
      if (typeof photo !== "string" || !photo) {
        return NextResponse.json({ error: "Photo proof is required" }, { status: 400 });
      }
      try {
        photoUrl = await savePunchPhoto(`sanitation-${taskAssignmentId}`, photo);
      } catch {
        return NextResponse.json({ error: "Could not save the photo" }, { status: 400 });
      }
    }
    await prisma.sanitationAssignment.update({
      where: { id: taskAssignmentId },
      data: { employeeId: matched.id, status: "DONE", completedAt: new Date(), photoUrl },
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

  // Re-verify the PIN belongs to the employee this task is assigned to --
  // never trust a client-supplied assignment id alone.
  const validPin = await verifyPin(pin, assignment.employee.pinHash);
  if (!validPin || !assignment.employee.active) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  if (assignment.status === "DONE") {
    return NextResponse.json({ ok: true, alreadyDone: true });
  }

  await prisma.taskAssignment.update({
    where: { id: taskAssignmentId },
    data: { status: "DONE", completedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
