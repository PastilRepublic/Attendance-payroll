import { prisma } from "@/lib/prisma";
import { createItem, recordStockMovement } from "./actions";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";

const categoryLabels: Record<string, string> = {
  INGREDIENT: "Ingredient",
  PRODUCT: "Product",
  PACKAGING: "Packaging",
};

export default async function InventoryPage() {
  const items = await prisma.inventoryItem.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
  });

  const sorted = [...items].sort((a, b) => {
    const aLow = Number(a.quantity) <= Number(a.lowStockThreshold);
    const bLow = Number(b.quantity) <= Number(b.lowStockThreshold);
    if (aLow === bLow) return a.name.localeCompare(b.name);
    return aLow ? -1 : 1;
  });

  return (
    <div>
      <PageHeader title="Inventory" description="Ingredients, products, and packaging on hand." />

      <details className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          + New Item
        </summary>
        <form action={createItem} className="p-4 pt-0 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input
              name="name"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Category</label>
            <select
              name="category"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="INGREDIENT">Ingredient</option>
              <option value="PRODUCT">Product</option>
              <option value="PACKAGING">Packaging</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Unit</label>
            <input
              name="unit"
              placeholder="kg, L, pcs..."
              required
              className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Starting quantity</label>
            <input
              name="initialQuantity"
              type="number"
              step="0.01"
              min="0"
              defaultValue={0}
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Low-stock threshold</label>
            <input
              name="lowStockThreshold"
              type="number"
              step="0.01"
              min="0"
              defaultValue={0}
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <Button>Add Item</Button>
        </form>
      </details>

      <div className="space-y-3">
        {sorted.map((item) => {
          const isLow = Number(item.quantity) <= Number(item.lowStockThreshold);
          return (
            <Card key={item.id} padded accent={isLow ? "red" : "none"}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900">{item.name}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {categoryLabels[item.category]}
                  </span>
                  {isLow && (
                    <span className="ml-2 inline-block">
                      <Badge status="lowStock" />
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">
                    {Number(item.quantity)} {item.unit}
                  </div>
                  <div className="text-xs text-slate-400">
                    threshold: {Number(item.lowStockThreshold)} {item.unit}
                  </div>
                </div>
              </div>

              <details className="mt-3">
                <summary className="text-xs text-slate-500 cursor-pointer hover:underline">
                  + Record stock in/out
                </summary>
                <form
                  action={recordStockMovement}
                  className="flex flex-wrap items-end gap-2 mt-2"
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <div>
                    <label className="block text-xs text-slate-500">Type</label>
                    <select
                      name="type"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="IN">Stock In</option>
                      <option value="OUT">Stock Out</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">Quantity ({item.unit})</label>
                    <input
                      name="quantity"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-slate-500">Reason (required)</label>
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="Delivery from supplier, used in production, etc."
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <Button size="sm">Record</Button>
                </form>
              </details>
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-slate-400 text-center py-12">No inventory items yet.</p>
        )}
      </div>
    </div>
  );
}
