import { auth } from "@/lib/auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

/** Owner-only: Payroll, Employee pay rates, Tasks (bonus-eligible), and payroll-affecting Settings fields. */
export async function requireOwner() {
  const user = await requireAdmin();
  if (user.role !== "OWNER") throw new Error("Unauthorized");
  return user;
}
