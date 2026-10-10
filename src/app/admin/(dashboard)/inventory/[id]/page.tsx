import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { formatQty } from "@/lib/format";
import { TIMEZONE } from "@/lib/payroll";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";

const HISTORY_LIMIT = 200;

export default async function InventoryHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) notFound();

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { itemId: id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      include: { createdByAdmin: { select: { name: true } } },
    }),
    prisma.stockMovement.count({ where: { itemId: id } }),
  ]);

  return (
    <div>
      <Link href="/admin/inventory" className="text-sm text-slate-500 hover:underline">
        ← Inventory
      </Link>
      <div className="mt-3">
        <SoftHeader
          title={`${item.name} history`}
          description={`${formatQty(Number(item.quantity))} ${item.unit} on hand${item.active ? "" : " · inactive"}`}
        />
      </div>

      <SoftCard padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Change</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                  {formatInTimeZone(m.createdAt, TIMEZONE, "MMM d, yyyy h:mm a")}
                </td>
                <td
                  className={`px-4 py-2 whitespace-nowrap font-medium ${
                    m.type === "IN" ? "text-green-700" : "text-rose-700"
                  }`}
                >
                  {m.type === "IN" ? "+" : "−"}
                  {formatQty(Number(m.quantity))} {item.unit}
                </td>
                <td className="px-4 py-2 text-slate-700">{m.reason}</td>
                <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                  {m.createdByAdmin?.name ?? "—"}
                </td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No stock movements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SoftCard>
      {total > movements.length && (
        <p className="mt-2 text-xs text-slate-400">
          Showing the latest {movements.length} of {total} movements.
        </p>
      )}
    </div>
  );
}
