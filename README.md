# Attendance & Payroll System (Phase 1)

Tablet kiosk attendance tracking + automatic payroll computation for a food manufacturing business. Phase 1 scope: attendance + gross payroll from hours worked. See the original build spec for full context and the roadmap for later phases.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Prisma 7 + PostgreSQL (local instance — see below)
- Auth.js (NextAuth v5) for admin login
- Vitest for the payroll calculation engine's unit tests

## One-time machine setup

This project needs Node.js, PostgreSQL, and Git installed locally (all installed via `winget` during initial setup on this machine):

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id PostgreSQL.PostgreSQL.17 -e
winget install --id Git.Git -e
```

After installing, **restart your terminal** (or reboot) so `node`, `psql`, and `git` are on your PATH without manual workarounds.

### Database

A local PostgreSQL 17 server runs as a Windows service (`postgresql-x64-17`), listening on `127.0.0.1:5432`. The `postgres` superuser password is set in `.env` as `DATABASE_URL`.

**Security note:** `pg_hba.conf` (at `C:\Program Files\PostgreSQL\17\data\pg_hba.conf`) was temporarily set to `trust` authentication for local connections during setup (to reset the superuser password without admin rights to restart the Windows service). This means **any local process on this machine can connect to Postgres without a password**. This is a reasonable tradeoff for a single-user dev machine, but if you want the password to actually be enforced, run PowerShell as Administrator and:

```powershell
# Edit pg_hba.conf: change "trust" back to "scram-sha-256" for the three local/host lines
notepad "C:\Program Files\PostgreSQL\17\data\pg_hba.conf"
Restart-Service postgresql-x64-17
```

Database: `attendance_payroll`, created via `psql`. To inspect it directly:

```powershell
$env:PGPASSWORD = "<password from .env>"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -U postgres -d attendance_payroll
```

### First run

```bash
npm install
npx prisma generate
npx prisma migrate dev   # applies migrations to your local DB
npm run db:seed          # creates the first admin user + default settings
npm run dev
```

Seeded admin login: printed to the console by `db:seed` (defaults to `periodtoffice@gmail.com` / `ChangeMe123!` unless overridden with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` env vars). **Change this password after first login** via Settings → Change Admin Password.

`db:seed` only creates the admin user, default settings, and the `kiosk-1` device — no fake employees, so it's safe to run against a real (including production) database. For local testing, add two sample employees (Maria Santos, PIN 1234; Juan Dela Cruz, PIN 5678) by setting `SEED_SAMPLE_DATA=true` before seeding.

Punch photo capture needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` even for local dev (see Deployment section below for where to get them) — without them, kiosk punches still work, but saving a photo will throw. Everything else works fine locally without these two set.

Open:
- `http://localhost:3000/kiosk` — the tablet kiosk (PIN entry, no login)
- `http://localhost:3000/admin` — the admin dashboard (login required)

### Tests

```bash
npm test          # payroll calculation engine unit tests (Vitest)
npx tsc --noEmit   # type-check
npx eslint .       # lint
```

## Project structure

- `src/lib/payroll.ts` — pure, unit-tested payroll calculation engine (no DB/UI dependencies)
- `src/lib/payrollService.ts` — DB-facing layer that computes/refreshes draft payslips from punches
- `src/lib/storage.ts` — punch-photo storage abstraction (local filesystem for now; swap for cloud blob storage at deploy time)
- `src/app/kiosk/` — the tablet kiosk UI, including the offline punch queue (`offlineQueue.ts`)
- `src/app/admin/(dashboard)/` — the authenticated admin UI (attendance, employees, payroll, settings)
- `src/app/admin/login/`, `src/app/admin/payslip/[id]/print/` — admin routes outside the dashboard nav shell
- `src/app/api/kiosk/` — kiosk-facing API routes (`identify`, `punch`)
- `prisma/schema.prisma` — data model
- `prisma/seed.ts` — seed script

## Known gaps / next steps

- **No password reset flow for a forgotten password** — there's a self-service change-password form on the Settings page (requires knowing the current password), but no "forgot password" / email-reset flow. If the admin password is ever forgotten, it needs a direct database update.
- **PDF export** is a print-optimized page (browser "Save as PDF"), not a server-generated PDF file. Fine for Phase 1; revisit if you want emailable payslips.

## Deployment (Vercel + Supabase)

Live at `attendance-payroll-lovat.vercel.app`, deployed from this repo's `main` branch (auto-deploys on every push). Production Postgres is a Supabase project.

**Environment variables** (Vercel → Settings → Environment Variables):
- `DATABASE_URL` — Supabase's **pooled** (Transaction pooler) connection string, port `6543`, e.g. `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`. **Do not add `sslmode=require`** to this string — see the gotcha below.
- `AUTH_SECRET` — a random secret (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- `NEXTAUTH_URL` — the exact production URL (must match Vercel's assigned domain exactly, no trailing slash)
- `SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Project Settings → API → service_role key. Used server-side only (punch photo upload/download via a private Storage bucket named `punch-photos` — create that bucket manually in Supabase → Storage before this works).

**Gotchas hit getting this working, in case they resurface:**
1. **Edge proxy can't import Prisma.** `src/proxy.ts` (middleware) runs on Vercel's Edge runtime, which can't use the `pg` driver. Auth config is split: `src/lib/auth.config.ts` (no Prisma, used by the proxy) vs `src/lib/auth.ts` (full config with the Prisma-backed Credentials provider, used everywhere else).
2. **Prisma client must be generated on every install.** `package.json` has `"postinstall": "prisma generate"` — without it, Vercel's build never generates `src/generated/prisma` and every route touching Prisma fails to build.
3. **`sslmode=require` in the connection string breaks TLS against Supabase.** Newer `pg-connection-string` versions treat `sslmode=require` as an alias for `verify-full` (strict certificate chain verification), which fails against Supabase's cert chain ("self-signed certificate in certificate chain") — and this takes priority over an explicit `ssl` option passed alongside a connection string, so a code-level fix alone isn't enough. Fix: don't put `sslmode` in the connection string at all; `src/lib/prisma.ts` detects a Supabase host and applies `ssl: { rejectUnauthorized: false }` itself (still encrypted, just not strict chain verification).
4. **Migrations need the direct connection, not the pooler.** `npx prisma migrate deploy` hung indefinitely over the pooled (port 6543) connection — schema changes need a stable session, which PgBouncer's transaction-mode pooling doesn't provide. Run migrations with `DATABASE_URL` temporarily set to the **direct** connection (port 5432, plain `postgres` user, no `pgbouncer`) instead, then switch back to the pooled URL for the app itself.

**To run migrations or seed against production** (from a local terminal, needs the real Supabase password — never commit it):
```powershell
$env:DATABASE_URL = "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
npx prisma migrate deploy
npm run db:seed
```
