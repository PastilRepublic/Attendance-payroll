import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";

export const ADMIN_PIN_PATTERN = /^\d{6}$/;
export const ADMIN_PIN_MESSAGE = "Admin PIN must be exactly 6 digits";

const MAX_FAILURES = 5;
const LOCKOUT_MINUTES = 15;

/** Thrown when PIN login is locked after too many wrong attempts. */
export class AdminPinLockedError extends Error {}

/**
 * Finds the active admin whose PIN this is, or null. Wrong guesses count
 * towards a global lockout (see Settings.adminPinFailures) since a PIN-only
 * login gives no account to throttle against.
 */
export async function findAdminByPin(pin: string) {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  if (settings.adminPinLockedUntil && settings.adminPinLockedUntil > new Date()) {
    throw new AdminPinLockedError();
  }

  const admins = await prisma.adminUser.findMany({
    where: { active: true, pinHash: { not: null } },
  });
  for (const admin of admins) {
    if (admin.pinHash && (await verifyPin(pin, admin.pinHash))) {
      if (settings.adminPinFailures > 0 || settings.adminPinLockedUntil) {
        await prisma.settings.update({
          where: { id: 1 },
          data: { adminPinFailures: 0, adminPinLockedUntil: null },
        });
      }
      return admin;
    }
  }

  const { adminPinFailures } = await prisma.settings.update({
    where: { id: 1 },
    data: { adminPinFailures: { increment: 1 } },
  });
  if (adminPinFailures >= MAX_FAILURES) {
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        adminPinFailures: 0,
        adminPinLockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
      },
    });
  }
  return null;
}

/** A PIN alone identifies the account, so no two active admins may share one. */
export async function assertAdminPinIsUnique(pin: string, excludeAdminId: string) {
  const others = await prisma.adminUser.findMany({
    where: { id: { not: excludeAdminId }, pinHash: { not: null } },
    select: { pinHash: true },
  });
  for (const other of others) {
    if (other.pinHash && (await verifyPin(pin, other.pinHash))) {
      throw new Error("This PIN is already in use by another admin. Choose a different PIN.");
    }
  }
}
