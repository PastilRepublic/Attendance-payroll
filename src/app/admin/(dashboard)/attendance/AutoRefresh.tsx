"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the current server-rendered page periodically so newly-punched
 * attendance shows up without a manual reload. */
export default function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
