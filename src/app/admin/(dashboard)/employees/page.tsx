import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PAY_BASIS_LABELS } from "@/lib/payroll";
import { setEmployeeActiveForm } from "./actions";
import ActionForm from "@/components/ActionForm";
import Badge from "@/components/Badge";
import Avatar from "@/components/Avatar";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import EmptyState from "@/components/ui/EmptyState";
import { pillClass } from "@/components/ui/styles";

export default async function EmployeesPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { adminAccount: true },
  });

  return (
    <div>
      <SoftHeader
        title="Employees"
        description="Everyone who has ever been on payroll, active or not."
        actions={
          <Link href="/admin/employees/new" className={pillClass("primary")}>
            + New employee
          </Link>
        }
      />

      {employees.length === 0 ? (
        <SoftCard>
          <EmptyState>No employees yet. Tap “New employee” to add the first one.</EmptyState>
        </SoftCard>
      ) : (
        <SoftCard padded={false}>
          <ul className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <li
                key={emp.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-7"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    name={emp.name}
                    photoUrl={emp.photoPath ? `/api/kiosk/employee-photo/${emp.photoPath}` : null}
                    size="sm"
                    ringColor="white"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{emp.name}</span>
                      <Badge status={emp.active ? "active" : "inactive"} />
                      {emp.adminAccount && (
                        <Badge status={emp.adminAccount.active ? "supervisor" : "accessRevoked"} />
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {PAY_BASIS_LABELS[emp.payBasis]} ·{" "}
                      {emp.payBasis === "OPERATION_DAY"
                        ? "By operation day"
                        : `₱${Number(emp.payRate).toFixed(2)}`}{" "}
                      · Hired {emp.dateHired.toISOString().slice(0, 10)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/employees/${emp.id}`} className={pillClass("secondary", "sm")}>
                    Edit
                  </Link>
                  <ActionForm compactError action={setEmployeeActiveForm.bind(null, emp.id, !emp.active)}>
                    <button
                      type="submit"
                      className={pillClass(emp.active ? "destructive" : "secondary", "sm")}
                    >
                      {emp.active ? "Deactivate" : "Activate"}
                    </button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </SoftCard>
      )}
    </div>
  );
}
