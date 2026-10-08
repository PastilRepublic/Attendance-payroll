/** The pale-cyan highlight banner: a title, a line of explanation, and a control on the right. */
export default function Banner({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-accent-200 bg-accent-50 p-5 sm:p-7">
      <div>
        <div className="text-lg font-medium text-accent-950">{title}</div>
        {description && <p className="mt-0.5 text-sm text-accent-800">{description}</p>}
      </div>
      {children}
    </div>
  );
}
