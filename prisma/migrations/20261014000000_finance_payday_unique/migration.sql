-- One payday per date (a voided payday doesn't count). Prisma can't describe a partial
-- index in the schema file, so this one lives only here.
CREATE UNIQUE INDEX "FinancePayday_date_active_key" ON "FinancePayday"("date") WHERE "voided" = false;
