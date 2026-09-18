"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin, hashPassword } from "@/lib/pin";
import { requireOwner } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { saveEmployeePhoto } from "@/lib/storage";

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
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits");

const supervisorAccessSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

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

  // Grant Supervisor access at creation time is optional -- only attempted
  // if an email was actually filled in under the collapsed section.
  const supervisorEmail = formData.get("supervisorEmail");
  const grantAccess = typeof supervisorEmail === "string" && supervisorEmail.trim() !== "";
  const accessParsed = grantAccess
    ? supervisorAccessSchema.parse({
        email: formData.get("supervisorEmail"),
        password: formData.get("supervisorPassword"),
      })
    : null;
  if (accessParsed) {
    const existingAdmin = await prisma.adminUser.findUnique({ where: { email: accessParsed.email } });
    if (existingAdmin) {
      throw new Error("An admin account with this email already exists.");
    }
  }

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

  try {
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const photoPath = await saveEmployeePhoto(employee.id, photo);
      await prisma.employee.update({ where: { id: employee.id }, data: { photoPath } });
    }
  } catch (err) {
    // Photo upload failing should never block creating the employee.
    console.error("[createEmployee] photo save failed:", err);
  }

  if (accessParsed) {
    const createdAdmin = await prisma.adminUser.create({
      data: {
        name: parsed.name,
        email: accessParsed.email,
        passwordHash: await hashPassword(accessParsed.password),
        role: "SUPERVISOR",
        employeeId: employee.id,
      },
    });

    await logAudit({
      actorAdminId: admin.id,
      action: "GRANT_SUPERVISOR_ACCESS",
      targetTable: "AdminUser",
      targetId: createdAdmin.id,
      after: { email: createdAdmin.email, employeeId: employee.id },
    });
  }

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

  // No file chosen leaves the existing photo alone.
  try {
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const photoPath = await saveEmployeePhoto(employeeId, photo);
      await prisma.employee.update({ where: { id: employeeId }, data: { photoPath } });
    }
  } catch (err) {
    console.error("[updateEmployee] photo save failed:", err);
  }

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

export async function grantSupervisorAccess(employeeId: string, formData: FormData) {
  const admin = await requireOwner();
  const parsed = supervisorAccessSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: parsed.email } });
  if (existingAdmin) {
    throw new Error("An admin account with this email already exists.");
  }

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });

  const created = await prisma.adminUser.create({
    data: {
      name: employee.name,
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
      role: "SUPERVISOR",
      employeeId,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "GRANT_SUPERVISOR_ACCESS",
    targetTable: "AdminUser",
    targetId: created.id,
    after: { email: created.email, employeeId },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees");
}

const updateAccessSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  newPassword: z.string().trim().optional(),
});

export async function updateSupervisorAccess(employeeId: string, formData: FormData) {
  const admin = await requireOwner();
  const parsed = updateAccessSchema.parse({
    email: formData.get("email"),
    newPassword: formData.get("newPassword") || undefined,
  });
  if (parsed.newPassword && parsed.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  const account = await prisma.adminUser.findUniqueOrThrow({ where: { employeeId } });

  if (parsed.email !== account.email) {
    const existingAdmin = await prisma.adminUser.findUnique({ where: { email: parsed.email } });
    if (existingAdmin) {
      throw new Error("An admin account with this email already exists.");
    }
  }

  await prisma.adminUser.update({
    where: { id: account.id },
    data: {
      email: parsed.email,
      passwordHash: parsed.newPassword ? await hashPassword(parsed.newPassword) : undefined,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_SUPERVISOR_ACCESS",
    targetTable: "AdminUser",
    targetId: account.id,
    before: { email: account.email },
    after: { email: parsed.email, passwordChanged: Boolean(parsed.newPassword) },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
}

export async function setSupervisorAccessActive(employeeId: string, active: boolean) {
  const admin = await requireOwner();
  const account = await prisma.adminUser.findUniqueOrThrow({ where: { employeeId } });

  await prisma.adminUser.update({
    where: { id: account.id },
    data: { active },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: active ? "REACTIVATE_SUPERVISOR_ACCESS" : "REVOKE_SUPERVISOR_ACCESS",
    targetTable: "AdminUser",
    targetId: account.id,
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees");
}
