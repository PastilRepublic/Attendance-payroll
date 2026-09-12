import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, hashPin } from "../src/lib/pin";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "periodtoffice@gmail.com";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "ChangeMe123!";

  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        name: "Owner",
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
      },
    });
    console.log(`Created admin user: ${adminEmail} / ${adminPassword}`);
    console.log("Change this password after your first login.");
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  const existingSettings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        id: 1,
        otMultiplier: 1.25,
        gracePeriodMinutes: 10,
        unpaidLunchMinutes: 60,
        regularHoursCapPerDay: 8,
        requirePhotoOnPunch: true,
        shiftStartTime: "08:00",
        shiftEndTime: "17:00",
        payPeriodStartDay: 1,
      },
    });
    console.log("Created default settings.");
  }

  const device = await prisma.device.upsert({
    where: { id: "kiosk-1" },
    update: {},
    create: { id: "kiosk-1", label: "Front Entrance" },
  });
  console.log(`Ensured device: ${device.label} (${device.id})`);

  const sampleEmployees = [
    { name: "Maria Santos", pin: "1234", payBasis: "HOURLY" as const, payRate: 90 },
    { name: "Juan Dela Cruz", pin: "5678", payBasis: "DAILY" as const, payRate: 720 },
  ];

  for (const emp of sampleEmployees) {
    const existing = await prisma.employee.findFirst({ where: { name: emp.name } });
    if (existing) continue;
    await prisma.employee.create({
      data: {
        name: emp.name,
        pinHash: await hashPin(emp.pin),
        payBasis: emp.payBasis,
        payRate: emp.payRate,
        dateHired: new Date(),
      },
    });
    console.log(`Created sample employee: ${emp.name} (PIN ${emp.pin})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
