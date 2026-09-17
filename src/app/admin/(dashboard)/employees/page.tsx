import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { setEmployeeActive } from "./actions";

export default async function EmployeesPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { adminAccount: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Employees</h1>
        <Link
          href="/admin/employees/new"
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
        >
          + New Employee
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
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
                  {emp.name}
                  {emp.adminAccount && (
                    <span
                      className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-normal ${
                        emp.adminAccount.active
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {emp.adminAccount.active ? "Supervisor" : "Access revoked"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{emp.payBasis}</td>
                <td className="px-4 py-3 text-slate-600">
                  ₱{Number(emp.payRate).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {emp.dateHired.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      emp.active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {emp.active ? "Active" : "Inactive"}
                  </span>
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
      </div>
    </div>
  );
}
