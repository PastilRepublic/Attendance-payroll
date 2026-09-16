"use client";

import Link from "next/link";

export default function InventoryError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="max-w-lg bg-white rounded-lg shadow p-6">
      <h1 className="text-lg font-semibold text-red-700 mb-2">Something went wrong</h1>
      <p className="text-sm text-slate-600 mb-4">{error.message}</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
        >
          Try again
        </button>
        <Link
          href="/admin/inventory"
          className="rounded-md bg-slate-100 text-slate-900 text-sm font-medium px-4 py-2 hover:bg-slate-200"
        >
          Back to Inventory
        </Link>
      </div>
    </div>
  );
}
