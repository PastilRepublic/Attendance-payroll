/** A dashed box with one friendly sentence, for lists with nothing in them yet. */
export default function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
