import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";

/** Employee PINs are only 4 digits, so wrong guesses are throttled: after this
 * many in a row the PIN is refused (even a correct one) for a while. Each
 * wrong PIN at the employee portal counts twice (it checks two endpoints). */
export const MAX_PIN_FAILURES = 6;
export const PIN_LOCKOUT_MINUTES = 10;

/** Thrown when PIN checks are locked after too many wrong attempts. */
export class PinLockedError extends Error {
  constructor(public lockedUntil: Date) {
    super("PIN locked");
  }
}

function lockoutMessage(lockedUntil: Date): string {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Too many wrong PIN attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask your admin.`;
}

function newLockoutDate(): Date {
  return new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60_000);
}

/**
 * Resolves which active employee a kiosk PIN belongs to. When `employeeId`
 * is given (the kiosk's name-selection step), verifies the PIN against only
 * that employee -- faster, and confirms the tapped name actually matches.
 * Without it, falls back to scanning all active employees (used where only a
 * PIN is entered, e.g. a supervisor override).
 *
 * Wrong PINs are counted -- per employee when one is given, otherwise
 * together -- and throw PinLockedError once locked. Use resolveEmployeeOrLocked
 * in API routes to turn that into the 429 response.
 */
export async function resolveEmployeeByPin(
  pin: string,
  employeeId?: string | null
): Promise<{ id: string; name: string } | null> {
  if (employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, pinHash: true, active: true, pinFailures: true, pinLockedUntil: true },
    });
    if (!employee || !employee.active) return null;
    if (employee.pinLockedUntil && employee.pinLockedUntil > new Date()) {
      throw new PinLockedError(employee.pinLockedUntil);
    }
    if (await verifyPin(pin, employee.pinHash)) {
      if (employee.pinFailures > 0 || employee.pinLockedUntil) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { pinFailures: 0, pinLockedUntil: null },
        });
      }
      return { id: employee.id, name: employee.name };
    }
    const { pinFailures } = await prisma.employee.update({
      where: { id: employee.id },
      data: { pinFailures: { increment: 1 } },
      select: { pinFailures: true },
    });
    if (pinFailures >= MAX_PIN_FAILURES) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { pinFailures: 0, pinLockedUntil: newLockoutDate() },
      });
    }
    return null;
  }

  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if (settings.employeePinLockedUntil && settings.employeePinLockedUntil > new Date()) {
    throw new PinLockedError(settings.employeePinLockedUntil);
  }

  const activeEmployees = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, pinHash: true },
  });
  for (const emp of activeEmployees) {
    if (await verifyPin(pin, emp.pinHash)) {
      if (settings.employeePinFailures > 0 || settings.employeePinLockedUntil) {
        await prisma.settings.update({
          where: { id: 1 },
          data: { employeePinFailures: 0, employeePinLockedUntil: null },
        });
      }
      return { id: emp.id, name: emp.name };
    }
  }

  const { employeePinFailures } = await prisma.settings.update({
    where: { id: 1 },
    data: { employeePinFailures: { increment: 1 } },
    select: { employeePinFailures: true },
  });
  if (employeePinFailures >= MAX_PIN_FAILURES) {
    await prisma.settings.update({
      where: { id: 1 },
      data: { employeePinFailures: 0, employeePinLockedUntil: newLockoutDate() },
    });
  }
  return null;
}

/**
 * resolveEmployeeByPin for API routes: `locked` is a ready 429 response when
 * PIN checks are locked (return it as-is); otherwise `matched` is the
 * employee, or null for an unrecognised PIN.
 */
export async function resolveEmployeeOrLocked(
  pin: string,
  employeeId?: string | null
): Promise<{ matched: { id: string; name: string } | null; locked: NextResponse | null }> {
  try {
    return { matched: await resolveEmployeeByPin(pin, employeeId), locked: null };
  } catch (err) {
    if (err instanceof PinLockedError) {
      return {
        matched: null,
        locked: NextResponse.json(
          { error: lockoutMessage(err.lockedUntil), code: "PIN_LOCKED" },
          { status: 429 }
        ),
      };
    }
    throw err;
  }
}
