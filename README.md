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

Seeded admin login: printed to the console by `db:seed` (defaults to `periodtoffice@gmail.com` / `ChangeMe123!` unless overridden with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` env vars). **Change this password after first login** — there's no self-service password-change UI yet; update it directly via the database or add one.

`db:seed` only creates the admin user, default settings, and the `kiosk-1` device — no fake employees, so it's safe to run against a real (including production) database. For local testing, add two sample employees (Maria Santos, PIN 1234; Juan Dela Cruz, PIN 5678) by setting `SEED_SAMPLE_DATA=true` before seeding.

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

- **Photo storage** is local filesystem (`storage/punch-photos/`, gitignored) for Phase 1 dev. Swap `src/lib/storage.ts` for a cloud blob provider before deploying so photos survive redeploys and are reachable from wherever the app is hosted.
- **No self-service admin password change/reset UI** — the only admin account is the seeded one.
- **Deployment**: not yet deployed. Confirmed plan: **Vercel** (hosting) + **Supabase** (managed production Postgres), once Phase 1 is feature-complete. Steps when that time comes: create a Vercel account and a Supabase project (both require the owner — not something Claude can do), push this repo to a Git remote Vercel can pull from, set `DATABASE_URL`/`AUTH_SECRET`/`NEXTAUTH_URL` as Vercel env vars pointing at the Supabase connection string, run `npx prisma migrate deploy` against it, and swap `src/lib/storage.ts` for a cloud blob provider (Vercel's filesystem isn't persistent).
- **PDF export** is a print-optimized page (browser "Save as PDF"), not a server-generated PDF file. Fine for Phase 1; revisit if you want emailable payslips.
