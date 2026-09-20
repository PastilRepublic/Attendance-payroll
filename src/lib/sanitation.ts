import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { TIMEZONE } from "@/lib/payroll";
import { getOperationDay, type ResolvedOperationDay } from "@/lib/settings";
import {
  isMonthlyDue,
  isWeeklyDue,
  nextMonthlyDate,
  nextWeeklyDate,
  reminderDateFor,
  reminderPhase,
  type ReminderPhase,
} from "@/lib/sanitationSchedule";
import type { Prisma } from "@/generated/prisma/client";

export function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

/** Matches a procedure's appliesTo against whichever operation day is
 * currently active -- BOTH always matches, a specific day only matches
 * itself, and a day off only matches BOTH (nothing day-specific runs). */
export function scopeFilterFor(
  operationDay: ResolvedOperationDay
): Prisma.SanitationProcedureWhereInput["appliesTo"] {
  return operationDay === "OFF" ? "BOTH" : { in: ["BOTH", operationDay] };
}

export interface ChemicalGuide {
  product: string;
  strength: string;
  dilution: string;
  /** True once an owner has saved the strength and dilution -- only then is the guide shown to employees. */
  confirmed: boolean;
}

export interface SanitationSettings {
  photoRequired: boolean;
  /** ISO weekday (1-7) weekly duties fall on. */
  weeklyDay: number;
  /** The owner's pick for the month's cleaning date, or null for the last weekly-day of the month. */
  monthlyOverride: string | null;
  chemicalGuide: ChemicalGuide;
}

export async function getSanitationSettings(): Promise<SanitationSettings> {
  const row = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return {
    photoRequired: row.sanitationPhotoRequired,
    weeklyDay: row.weeklyCleaningDay,
    monthlyOverride: row.monthlyCleaningDate ? row.monthlyCleaningDate.toISOString().slice(0, 10) : null,
    chemicalGuide: {
      product: row.chemicalProduct,
      strength: row.chemicalStrength,
      dilution: row.chemicalDilution,
      confirmed: row.chemicalGuideConfirmedAt !== null,
    },
  };
}

/** Which schedules come up on a given day: daily always, weekly / monthly only on their cleaning day. */
export function dueSchedulesFor(
  todayKey: string,
  settings: Pick<SanitationSettings, "weeklyDay" | "monthlyOverride">
): ("DAILY" | "WEEKLY" | "MONTHLY")[] {
  const due: ("DAILY" | "WEEKLY" | "MONTHLY")[] = ["DAILY"];
  if (isWeeklyDue(todayKey, settings.weeklyDay)) due.push("WEEKLY");
  if (isMonthlyDue(todayKey, settings.weeklyDay, settings.monthlyOverride)) due.push("MONTHLY");
  return due;
}

/**
 * Assignments are scheduled per calendar day and don't appear on their own
 * -- an admin would otherwise have to re-assign procedures every day. Runs
 * on every load of a sanitation surface (cheap: only inserts what's
 * missing) rather than once per day, so toggling the operation day
 * mid-day immediately schedules whichever procedures newly apply, as
 * fresh unassigned/pending duties. Already-scheduled procedures for a
 * *different* operation day are left alone (not deleted) -- see
 * scopeFilterFor, applied at read time, for hiding them from today's
 * display. Weekly and monthly duties are only scheduled on their cleaning
 * day; every other day they just show up as upcoming reminders.
 */
export async function ensureTodaysSanitationSchedule(): Promise<void> {
  const todayKey = todayManila();
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const [operationDay, settings] = await Promise.all([getOperationDay(), getSanitationSettings()]);

  const matchingProcedures = await prisma.sanitationProcedure.findMany({
    where: {
      active: true,
      appliesTo: scopeFilterFor(operationDay),
      schedule: { in: dueSchedulesFor(todayKey, settings) },
    },
    select: { id: true },
  });
  if (matchingProcedures.length === 0) return;

  const existing = await prisma.sanitationAssignment.findMany({
    where: { date: today, procedureId: { in: matchingProcedures.map((p) => p.id) } },
    select: { procedureId: true },
  });
  const existingIds = new Set(existing.map((a) => a.procedureId));
  const toCreate = matchingProcedures.filter((p) => !existingIds.has(p.id));
  if (toCreate.length === 0) return;

  await prisma.sanitationAssignment.createMany({
    data: toCreate.map((p) => ({ procedureId: p.id, date: today })),
  });
}

export interface UpcomingSanitation {
  schedule: "WEEKLY" | "MONTHLY";
  /** The next cleaning date (today counts), as yyyy-MM-dd. */
  dueDate: string;
  reminderDate: string;
  phase: ReminderPhase;
  tasks: { id: string; name: string; instruction: string; timing: "PRE_COOKING" | "POST_COOKING" | "ANYTIME" }[];
}

/** The weekly and monthly duties still to come, with their next cleaning date and reminder window. */
export async function getUpcomingSanitation(
  todayKey: string,
  operationDay: ResolvedOperationDay,
  settings: Pick<SanitationSettings, "weeklyDay" | "monthlyOverride">
): Promise<{ weekly: UpcomingSanitation; monthly: UpcomingSanitation }> {
  const procedures = await prisma.sanitationProcedure.findMany({
    where: {
      active: true,
      appliesTo: scopeFilterFor(operationDay),
      schedule: { in: ["WEEKLY", "MONTHLY"] },
    },
    orderBy: { name: "asc" },
  });

  const build = (schedule: "WEEKLY" | "MONTHLY", dueDate: string): UpcomingSanitation => ({
    schedule,
    dueDate,
    reminderDate: reminderDateFor(dueDate),
    phase: reminderPhase(todayKey, dueDate),
    tasks: procedures
      .filter((p) => p.schedule === schedule)
      .map((p) => ({ id: p.id, name: p.name, instruction: p.steps, timing: p.timing })),
  });

  return {
    weekly: build("WEEKLY", nextWeeklyDate(todayKey, settings.weeklyDay)),
    monthly: build("MONTHLY", nextMonthlyDate(todayKey, settings.weeklyDay, settings.monthlyOverride)),
  };
}

/** One line for the chemical guide, e.g. "Zonrox · 5% · 1 tbsp per litre" -- null until an owner confirms it. */
export function chemicalGuideText(guide: ChemicalGuide): string | null {
  if (!guide.confirmed) return null;
  return [guide.product, guide.strength, guide.dilution].filter(Boolean).join(" · ");
}
