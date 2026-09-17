import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // A JWT session can outlive a revoked account (no server-side session
  // store to invalidate), so re-check active status on every action rather
  // than trusting the token alone -- this is what makes revoking access
  // take effect immediately instead of "after their session expires."
  const admin = await prisma.adminUser.findUnique({ where: { id: session.user.id } });
  if (!admin || !admin.active) throw new Error("Unauthorized");

  return session.user;
}

/** Owner-only: Payroll, Employee pay rates, Tasks (bonus-eligible), and payroll-affecting Settings fields. */
export async function requireOwner() {
  const user = await requireAdmin();
  if (user.role !== "OWNER") throw new Error("Unauthorized");
  return user;
}
