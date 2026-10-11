"use client";

import { useState, type ReactNode } from "react";
import { inputClass } from "@/components/ui/styles";

interface Item {
  id: string;
  /** Everything a search should look at: type, what it was, date, who added it, note, amount. */
  text: string;
  node: ReactNode;
}

/**
 * The month's records, kept short: the newest few, a search box that looks through all of them,
 * and the voided ones tucked behind a button. The lines themselves are drawn by the page.
 */
export default function RecordsList({
  active,
  voided,
  initial = 5,
}: {
  active: Item[];
  voided: Item[];
  initial?: number;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showVoided, setShowVoided] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = (i: Item) => !q || i.text.toLowerCase().includes(q);
  const shownActive = active.filter(matches);
  const shownVoided = voided.filter(matches);
  // Searching shows every match; otherwise only the newest few until asked for more.
  const visible = q || showAll ? shownActive : shownActive.slice(0, initial);
  const hiddenCount = shownActive.length - visible.length;

  const link =
    "block w-full cursor-pointer border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium hover:bg-slate-50 sm:px-5";

  return (
    <div>
      <div className="px-4 pb-3 sm:px-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search these records (chicken, Shopee, a name, an amount…)"
          aria-label="Search records"
          className={`${inputClass} !py-2`}
        />
      </div>

      {shownActive.length === 0 && (!q || shownVoided.length === 0) ? (
        <p className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          {q ? "No records match that." : "No records yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">{visible.map((i) => i.node)}</ul>
      )}

      {!q && hiddenCount > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className={`${link} text-accent-800`}>
          Show {hiddenCount} older {hiddenCount === 1 ? "record" : "records"}
        </button>
      )}
      {!q && showAll && active.length > initial && (
        <button type="button" onClick={() => setShowAll(false)} className={`${link} text-accent-800`}>
          Show fewer
        </button>
      )}

      {q && shownVoided.length > 0 && (
        <>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">Voided</p>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">{shownVoided.map((i) => i.node)}</ul>
        </>
      )}
      {!q && voided.length > 0 && (
        <>
          <button type="button" onClick={() => setShowVoided((v) => !v)} className={`${link} text-slate-500`}>
            {showVoided ? "Hide voided records" : `Show voided records (${voided.length})`}
          </button>
          {showVoided && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">{voided.map((i) => i.node)}</ul>
          )}
        </>
      )}
    </div>
  );
}
