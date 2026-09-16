import { prisma } from "@/lib/prisma";
import { createItem, recordStockMovement } from "./actions";

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
      </div>

      <details className="mb-6 bg-white rounded-lg shadow">
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
          <button className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Add Item
          </button>
        </form>
      </details>

      <div className="space-y-3">
        {sorted.map((item) => {
          const isLow = Number(item.quantity) <= Number(item.lowStockThreshold);
          return (
            <div key={item.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900">{item.name}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {categoryLabels[item.category]}
                  </span>
                  {isLow && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                      Low stock
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
                  <button className="rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 hover:bg-slate-800">
                    Record
                  </button>
                </form>
              </details>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-slate-400 text-center py-12">No inventory items yet.</p>
        )}
      </div>
    </div>
  );
}
