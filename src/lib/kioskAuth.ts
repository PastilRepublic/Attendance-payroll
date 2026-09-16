import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";

/**
 * Resolves which active employee a kiosk PIN belongs to. When `employeeId`
 * is given (the kiosk's name-selection step), verifies the PIN against only
 * that employee -- faster, and confirms the tapped name actually matches.
 * Without it, falls back to scanning all active employees (used by the
 * offline queue, where a stored employeeId may be unavailable).
 */
export async function resolveEmployeeByPin(
  pin: string,
  employeeId?: string | null
): Promise<{ id: string; name: string } | null> {
  if (employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, pinHash: true, active: true },
    });
    if (!employee || !employee.active) return null;
    const valid = await verifyPin(pin, employee.pinHash);
    return valid ? { id: employee.id, name: employee.name } : null;
  }

  const activeEmployees = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, pinHash: true },
  });
  for (const emp of activeEmployees) {
    if (await verifyPin(pin, emp.pinHash)) {
      return { id: emp.id, name: emp.name };
    }
  }
  return null;
}
