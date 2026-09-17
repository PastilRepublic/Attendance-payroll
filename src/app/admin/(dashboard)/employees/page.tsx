import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { setEmployeeActive } from "./actions";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Avatar from "@/components/Avatar";
import Button from "@/components/Button";

export default async function EmployeesPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { adminAccount: true },
  });

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Everyone who has ever been on payroll, active or not."
        actions={
          <Link href="/admin/employees/new">
            <Button>+ New Employee</Button>
          </Link>
        }
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Pay basis</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Date hired</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <span className="flex items-center gap-2">
                    <Avatar
                      name={emp.name}
                      photoUrl={emp.photoPath ? `/api/kiosk/employee-photo/${emp.photoPath}` : null}
                      size="sm"
                      ringColor="white"
                    />
                    {emp.name}
                    {emp.adminAccount && (
                      <Badge status={emp.adminAccount.active ? "supervisor" : "accessRevoked"} />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{emp.payBasis}</td>
                <td className="px-4 py-3 text-slate-600">
                  ₱{Number(emp.payRate).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {emp.dateHired.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <Badge status={emp.active ? "active" : "inactive"} />
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <Link
                    href={`/admin/employees/${emp.id}`}
                    className="text-slate-700 hover:underline"
                  >
                    Edit
                  </Link>
                  <form
                    action={setEmployeeActive.bind(null, emp.id, !emp.active)}
                    className="inline"
                  >
                    <button type="submit" className="text-slate-700 hover:underline">
                      {emp.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
