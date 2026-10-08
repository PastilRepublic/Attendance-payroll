import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/pin";

export const MAX_PASSWORD_FAILURES = 5;
export const PASSWORD_LOCKOUT_MINUTES = 15;
/** The "N attempts left" warning starts once this few remain. */
export const WARN_PASSWORD_ATTEMPTS_LEFT = 3;

/** Thrown when an account's password login is locked after too many wrong attempts. */
export class AdminPasswordLockedError extends Error {}

export type PasswordCheck =
  | { admin: NonNullable<Awaited<ReturnType<typeof findAdmin>>>; attemptsLeft: null }
  | { admin: null; attemptsLeft: number | null };

function findAdmin(email: string) {
  return prisma.adminUser.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
  });
}

/**
 * Checks an admin's email + password. Wrong passwords are counted per account:
 * after MAX_PASSWORD_FAILURES in a row the account's password login is refused
 * -- even with the right password -- for PASSWORD_LOCKOUT_MINUTES (throws
 * AdminPasswordLockedError). A correct password resets the count. An unknown or
 * deactivated account just fails (attemptsLeft null): there's nothing to count.
 */
export async function checkAdminPassword(email: string, password: string): Promise<PasswordCheck> {
  const admin = await findAdmin(email);
  if (!admin || !admin.active) return { admin: null, attemptsLeft: null };

  if (admin.passwordLockedUntil && admin.passwordLockedUntil > new Date()) {
    throw new AdminPasswordLockedError();
  }

  if (await verifyPassword(password, admin.passwordHash)) {
    if (admin.passwordFailures > 0 || admin.passwordLockedUntil) {
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { passwordFailures: 0, passwordLockedUntil: null },
      });
    }
    return { admin, attemptsLeft: null };
  }

  const { passwordFailures } = await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordFailures: { increment: 1 } },
    select: { passwordFailures: true },
  });
  if (passwordFailures >= MAX_PASSWORD_FAILURES) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordFailures: 0,
        passwordLockedUntil: new Date(Date.now() + PASSWORD_LOCKOUT_MINUTES * 60_000),
      },
    });
    throw new AdminPasswordLockedError();
  }
  return { admin: null, attemptsLeft: MAX_PASSWORD_FAILURES - passwordFailures };
}
