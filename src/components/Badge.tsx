export type BadgeStatus =
  | "late"
  | "undertime"
  | "halfDay"
  | "noTimeOut"
  | "lateFromBreak"
  | "onTime"
  | "notYetTimedIn"
  | "paidLeave"
  | "unpaidAbsence"
  | "active"
  | "inactive"
  | "supervisor"
  | "accessRevoked"
  | "pass"
  | "fail"
  | "awaiting"
  | "pending"
  | "done"
  | "pendingTask"
  | "lowStock"
  | "finalized"
  | "open";

const STATUS_STYLES: Record<BadgeStatus, { className: string; label: string }> = {
  late: { className: "bg-rose-100 text-rose-700", label: "Late" },
  undertime: { className: "bg-orange-100 text-orange-700", label: "Undertime" },
  halfDay: { className: "bg-orange-100 text-orange-700", label: "Half day" },
  noTimeOut: { className: "bg-red-100 text-red-700", label: "No Time Out" },
  lateFromBreak: { className: "bg-amber-100 text-amber-700", label: "Late from break" },
  onTime: { className: "bg-green-100 text-green-700", label: "On time" },
  notYetTimedIn: { className: "bg-slate-100 text-slate-500", label: "Not yet timed in" },
  paidLeave: { className: "bg-blue-100 text-blue-700", label: "Paid leave" },
  unpaidAbsence: { className: "bg-red-100 text-red-700", label: "Unpaid absence" },
  active: { className: "bg-green-100 text-green-700", label: "Active" },
  inactive: { className: "bg-slate-200 text-slate-600", label: "Inactive" },
  supervisor: { className: "bg-indigo-100 text-indigo-700", label: "Supervisor" },
  accessRevoked: { className: "bg-slate-200 text-slate-500", label: "Access revoked" },
  pass: { className: "bg-green-100 text-green-700", label: "Pass" },
  fail: { className: "bg-rose-100 text-rose-700", label: "Fail" },
  awaiting: { className: "bg-blue-100 text-blue-700", label: "Awaiting inspection" },
  pending: { className: "bg-slate-100 text-slate-500", label: "Pending" },
  done: { className: "bg-green-100 text-green-700", label: "Done" },
  pendingTask: { className: "bg-amber-100 text-amber-700", label: "Pending" },
  lowStock: { className: "bg-red-100 text-red-700", label: "Low stock" },
  finalized: { className: "bg-green-100 text-green-700", label: "Finalized" },
  open: { className: "bg-amber-100 text-amber-700", label: "Open" },
};

export default function Badge({
  status,
  children,
}: {
  status: BadgeStatus;
  children?: React.ReactNode;
}) {
  const { className, label } = STATUS_STYLES[status];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children ?? label}
    </span>
  );
}
