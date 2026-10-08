"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runForm, type FormState } from "@/lib/formAction";
import { prisma } from "@/lib/prisma";
import { recordEmployeeRate } from "@/lib/payRates";
import { hashPin, verifyPin, hashPassword } from "@/lib/pin";
import { requireOwner } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { saveEmployeePhoto } from "@/lib/storage";
import { isRealDateKey } from "@/lib/punchRules";

const MAX_PAY_RATE = 100000;
const round2 = (n: number) => Math.round(n * 100) / 100;

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

const employeeSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    payBasis: z.enum(["HOURLY", "DAILY", "FLAT_DAILY", "OPERATION_DAY"]),
    payRate: z.coerce.number().min(0).catch(0),
    dateHired: z.string().refine(isRealDateKey, "Enter a valid date hired"),
  })
  // Production (OPERATION_DAY) pay comes from the Settings rates, so the
  // per-employee rate only has to be filled in for the other pay bases.
  .refine((v) => v.payBasis === "OPERATION_DAY" || v.payRate > 0, {
    message: "Pay rate must be greater than 0",
    path: ["payRate"],
  })
  .refine((v) => v.payRate <= MAX_PAY_RATE, {
    message: "Pay rate must be ₱100,000 or less",
    path: ["payRate"],
  })
  .transform((v) => ({ ...v, payRate: v.payBasis === "OPERATION_DAY" ? 0 : round2(v.payRate) }));

const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits");

/** Emails are stored lowercase and matched case-insensitively (phone keyboards
 * love to capitalise the first letter). */
const emailField = z.string().trim().toLowerCase().email("Valid email is required");

const supervisorAccessSchema = z.object({
  email: emailField,
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
    const existingAdmin = await prisma.adminUser.findFirst({
      where: { email: { equals: accessParsed.email, mode: "insensitive" } },
    });
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

  await recordEmployeeRate(employee.id, parsed.payRate, "CREATED");

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

  // Each worked day is paid the rate in effect that day, so a new rate only
  // applies from today on (a pay basis change still covers the open period).
  if (before.payBasis !== parsed.payBasis) {
    await recordEmployeeRate(employeeId, parsed.payRate, "BASIS_CHANGED");
  } else if (Number(before.payRate) !== parsed.payRate) {
    await recordEmployeeRate(employeeId, parsed.payRate, "RATE_CHANGED", Number(before.payRate));
  }

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
    data: { pinHash: await hashPin(pin), pinFailures: 0, pinLockedUntil: null },
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

  const existingAdmin = await prisma.adminUser.findFirst({
    where: { email: { equals: parsed.email, mode: "insensitive" } },
  });
  if (existingAdmin) {
    throw new Error("An admin account with this email already exists.");
  }

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  if (await prisma.adminUser.findUnique({ where: { employeeId } })) {
    throw new Error("This employee already has an admin account.");
  }

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
  email: emailField,
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

  if (parsed.email !== account.email.toLowerCase()) {
    const existingAdmin = await prisma.adminUser.findFirst({
      where: { email: { equals: parsed.email, mode: "insensitive" }, id: { not: account.id } },
    });
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

// Form versions of the actions above (see ActionForm): they return the problem
// to the form instead of throwing; a successful save still redirects.

export async function createEmployeeForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => createEmployee(formData));
}

export async function updateEmployeeForm(employeeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => updateEmployee(employeeId, formData));
}

export async function resetEmployeePinForm(employeeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => resetEmployeePin(employeeId, formData));
}

export async function updateSupervisorAccessForm(employeeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => updateSupervisorAccess(employeeId, formData));
}

export async function grantSupervisorAccessForm(employeeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => grantSupervisorAccess(employeeId, formData));
}
