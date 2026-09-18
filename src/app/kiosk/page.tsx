import type { Metadata } from "next";
import KioskClient from "./KioskClient";

export const metadata: Metadata = {
  title: "Kiosk — Attendance",
};

export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const params = await searchParams;
  return <KioskClient initialEmployeeId={params.employee ?? null} />;
}
