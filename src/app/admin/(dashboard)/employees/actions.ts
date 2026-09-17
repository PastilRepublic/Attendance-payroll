"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin } from "@/lib/pin";
import { requireOwner } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/** PINs identify who is punching, so no two active employees may share one. */
async function assertPinIsUnique(pin: string, excludeEmployeeId?: string) {
  const activeEmployees = await prisma.employee.findMany({
    where: { active: true, id: excludeEmployeeId ? { not: excludeEmployeeId } : undefined },
    select: { pinHash: true },
  });
  for (const emp of activeEmployees) {
    if (await verifyPin(pin, emp.pinHash)) {
      throw new Error("This PIN is already in use by another active employee. Choose a different PIN.");
    }
  }
}

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  payBasis: z.enum(["HOURLY", "DAILY"]),
  payRate: z.coerce.number().positive("Pay rate must be greater than 0"),
  dateHired: z.string().min(1, "Date hired is required"),
});

const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, "PIN must be 4-6 digits");

export async function createEmployee(formData: FormData) {
  const admin = await requireOwner();

  const parsed = employeeSchema.parse({
    name: formData.get("name"),
    payBasis: formData.get("payBasis"),
    payRate: formData.get("payRate"),
    dateHired: formData.get("dateHired"),
  });
  const pin = pinSchema.parse(formData.get("pin"));
  await assertPinIsUnique(pin);

  const employee = await prisma.employee.create({
    data: {
      name: parsed.name,
      payBasis: parsed.payBasis,
      payRate: parsed.payRate,
      dateHired: new Date(parsed.dateHired),
      pinHash: await hashPin(pin),
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "CREATE_EMPLOYEE",
    targetTable: "Employee",
    targetId: employee.id,
    after: { name: employee.name, payBasis: employee.payBasis, payRate: parsed.payRate },
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees");
}

export async function updateEmployee(employeeId: string, formData: FormData) {
  const admin = await requireOwner();

  const parsed = employeeSchema.parse({
    name: formData.get("name"),
    payBasis: formData.get("payBasis"),
    payRate: formData.get("payRate"),
    dateHired: formData.get("dateHired"),
  });

  const before = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      name: parsed.name,
      payBasis: parsed.payBasis,
      payRate: parsed.payRate,
      dateHired: new Date(parsed.dateHired),
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_EMPLOYEE",
    targetTable: "Employee",
    targetId: employeeId,
    before: { name: before.name, payBasis: before.payBasis, payRate: before.payRate },
    after: { name: updated.name, payBasis: updated.payBasis, payRate: parsed.payRate },
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees");
}

export async function resetEmployeePin(employeeId: string, formData: FormData) {
  const admin = await requireOwner();

  const pin = pinSchema.parse(formData.get("pin"));
  await assertPinIsUnique(pin, employeeId);

  await prisma.employee.update({
    where: { id: employeeId },
    data: { pinHash: await hashPin(pin) },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "RESET_EMPLOYEE_PIN",
    targetTable: "Employee",
    targetId: employeeId,
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees");
}

export async function setEmployeeActive(employeeId: string, active: boolean) {
  const admin = await requireOwner();

  await prisma.employee.update({
    where: { id: employeeId },
    data: { active },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: active ? "ACTIVATE_EMPLOYEE" : "DEACTIVATE_EMPLOYEE",
    targetTable: "Employee",
    targetId: employeeId,
  });

  revalidatePath("/admin/employees");
}
