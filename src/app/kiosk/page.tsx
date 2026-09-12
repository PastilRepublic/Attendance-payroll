import type { Metadata } from "next";
import KioskClient from "./KioskClient";

export const metadata: Metadata = {
  title: "Kiosk — Attendance",
};

export default function KioskPage() {
  return <KioskClient />;
}
