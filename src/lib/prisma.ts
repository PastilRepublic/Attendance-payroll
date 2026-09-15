import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Managed Postgres providers (e.g. Supabase) present a certificate chain
// that Node's strict TLS verification rejects as "self-signed" -- this
// disables chain verification (connection is still encrypted) only when
// connecting to a managed host, so local Postgres (no SSL) is unaffected.
// A `sslmode=require` query param on the connection string is deliberately
// NOT relied on here: newer pg-connection-string versions treat it as an
// alias for `verify-full` (strict chain verification), which overrides an
// explicit ssl config passed alongside it and reproduces this exact error.
const connectionString = process.env.DATABASE_URL ?? "";
const useSsl = /supabase\.(co|com)/.test(connectionString);

const adapter = new PrismaPg({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
