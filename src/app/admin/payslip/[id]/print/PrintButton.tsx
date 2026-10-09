"use client";

import { pillClass } from "@/components/ui/styles";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className={pillClass("primary")}>
      Print / Save as PDF
    </button>
  );
}
