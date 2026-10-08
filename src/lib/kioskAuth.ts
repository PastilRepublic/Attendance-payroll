import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";

/** Employee PINs are only 4 digits, so wrong guesses are throttled: after this
 * many in a row the PIN is refused (even a correct one) for a while. */
export const MAX_PIN_FAILURES = 6;
/** The "N attempts left" warning starts once this few remain. */
export const WARN_ATTEMPTS_LEFT = 3;
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
  return (await checkPin(pin, employeeId)).matched;
}

interface PinCheck {
  matched: { id: string; name: string } | null;
  /** Wrong PINs left before the lock; only set when matched is null. */
  attemptsLeft: number;
  /** Set when this very wrong PIN triggered the lock. */
  justLockedUntil: Date | null;
}

async function checkPin(pin: string, employeeId?: string | null): Promise<PinCheck> {
  const fail = (failures: number, lockedUntil: Date | null): PinCheck => ({
    matched: null,
    attemptsLeft: Math.max(MAX_PIN_FAILURES - failures, 0),
    justLockedUntil: lockedUntil,
  });
  const ok = (m: { id: string; name: string }): PinCheck => ({ matched: m, attemptsLeft: MAX_PIN_FAILURES, justLockedUntil: null });
  if (employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, pinHash: true, active: true, pinFailures: true, pinLockedUntil: true },
    });
    if (!employee || !employee.active) return fail(0, null);
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
      return ok({ id: employee.id, name: employee.name });
    }
    const { pinFailures } = await prisma.employee.update({
      where: { id: employee.id },
      data: { pinFailures: { increment: 1 } },
      select: { pinFailures: true },
    });
    if (pinFailures >= MAX_PIN_FAILURES) {
      const until = newLockoutDate();
      await prisma.employee.update({
        where: { id: employee.id },
        data: { pinFailures: 0, pinLockedUntil: until },
      });
      return fail(pinFailures, until);
    }
    return fail(pinFailures, null);
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
      return ok({ id: emp.id, name: emp.name });
    }
  }

  const { employeePinFailures } = await prisma.settings.update({
    where: { id: 1 },
    data: { employeePinFailures: { increment: 1 } },
    select: { employeePinFailures: true },
  });
  if (employeePinFailures >= MAX_PIN_FAILURES) {
    const until = newLockoutDate();
    await prisma.settings.update({
      where: { id: 1 },
      data: { employeePinFailures: 0, employeePinLockedUntil: until },
    });
    return fail(employeePinFailures, until);
  }
  return fail(employeePinFailures, null);
}

function lockedResponse(lockedUntil: Date) {
  return NextResponse.json({ error: lockoutMessage(lockedUntil), code: "PIN_LOCKED" }, { status: 429 });
}

/**
 * resolveEmployeeByPin for API routes. When `rejection` is set, return it
 * as-is: a 429 if PIN checks are locked (including when this wrong PIN just
 * triggered the lock), or a 401 for a wrong PIN -- which warns "N attempts
 * left" once only a few remain. Otherwise `matched` is the employee.
 */
export async function resolveEmployeeOrLocked(
  pin: string,
  employeeId?: string | null
): Promise<
  | { matched: { id: string; name: string }; rejection: null }
  | { matched: null; rejection: NextResponse }
> {
  try {
    const result = await checkPin(pin, employeeId);
    if (result.matched) return { matched: result.matched, rejection: null };
    if (result.justLockedUntil) return { matched: null, rejection: lockedResponse(result.justLockedUntil) };
    const left = result.attemptsLeft;
    const warn = left > 0 && left <= WARN_ATTEMPTS_LEFT;
    const error = warn
      ? `PIN not recognized. You have ${left} attempt${left === 1 ? "" : "s"} left.`
      : "PIN not recognized";
    return { matched: null, rejection: NextResponse.json({ error, attemptsLeft: left }, { status: 401 }) };
  } catch (err) {
    if (err instanceof PinLockedError) return { matched: null, rejection: lockedResponse(err.lockedUntil) };
    throw err;
  }
}
