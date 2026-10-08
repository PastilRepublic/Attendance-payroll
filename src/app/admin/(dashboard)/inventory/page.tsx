import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  createItemForm,
  recordStockMovementForm,
  setItemActive,
  setItemActiveForm,
  updateItemForm,
} from "./actions";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";

const categoryLabels: Record<string, string> = {
  INGREDIENT: "Ingredient",
  PRODUCT: "Product",
  PACKAGING: "Packaging",
};

const INPUT = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const INPUT_SM = "rounded-md border border-slate-300 px-2 py-1 text-xs";

export default async function InventoryPage() {
  const all = await prisma.inventoryItem.findMany({ orderBy: [{ name: "asc" }] });
  const items = all.filter((i) => i.active);
  const inactive = all.filter((i) => !i.active);

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
        <ActionForm
          action={createItemForm}
          resetOnSuccess
          className="p-4 pt-0 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input name="name" required className={INPUT} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Category</label>
            <select name="category" className={INPUT}>
              <option value="INGREDIENT">Ingredient</option>
              <option value="PRODUCT">Product</option>
              <option value="PACKAGING">Packaging</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Unit</label>
            <input name="unit" placeholder="kg, L, pcs..." required className={`w-24 ${INPUT}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Starting quantity</label>
            <input
              name="initialQuantity"
              type="number"
              step="0.01"
              min="0"
              defaultValue={0}
              className={`w-28 ${INPUT}`}
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
              className={`w-28 ${INPUT}`}
            />
          </div>
          <Button>Add Item</Button>
        </ActionForm>
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
                <ActionForm
                  action={recordStockMovementForm}
                  resetOnSuccess
                  className="flex flex-wrap items-end gap-2 mt-2"
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <div>
                    <label className="block text-xs text-slate-500">Type</label>
                    <select name="type" className={INPUT_SM}>
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
                      className={`w-24 ${INPUT_SM}`}
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-slate-500">Reason (required)</label>
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="Delivery from supplier, used in production, etc."
                      className={`w-full ${INPUT_SM}`}
                    />
                  </div>
                  <Button size="sm">Record</Button>
                </ActionForm>
              </details>

              <details className="mt-2">
                <summary className="text-xs text-slate-500 cursor-pointer hover:underline">
                  Edit item
                </summary>
                <ActionForm
                  action={updateItemForm}
                  successMessage="Saved"
                  className="flex flex-wrap items-end gap-2 mt-2"
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <div>
                    <label className="block text-xs text-slate-500">Name</label>
                    <input name="name" required defaultValue={item.name} className={INPUT_SM} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">Category</label>
                    <select name="category" defaultValue={item.category} className={INPUT_SM}>
                      <option value="INGREDIENT">Ingredient</option>
                      <option value="PRODUCT">Product</option>
                      <option value="PACKAGING">Packaging</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">Unit</label>
                    <input name="unit" required defaultValue={item.unit} className={`w-20 ${INPUT_SM}`} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">Low-stock threshold</label>
                    <input
                      name="lowStockThreshold"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={Number(item.lowStockThreshold)}
                      className={`w-24 ${INPUT_SM}`}
                    />
                  </div>
                  <Button size="sm">Save</Button>
                </ActionForm>
                <p className="mt-1 text-xs text-slate-400">
                  To change how much is on hand, use stock in/out so the change has a reason.
                </p>
              </details>

              <div className="mt-3 flex items-center justify-between">
                <Link
                  href={`/admin/inventory/${item.id}`}
                  className="text-xs text-slate-600 hover:underline"
                >
                  History
                </Link>
                <form action={setItemActive}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="active" value="false" />
                  <ConfirmSubmitButton
                    message={`Deactivate ${item.name}? It disappears from this list, but it and its history stay saved and you can bring it back.`}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Deactivate
                  </ConfirmSubmitButton>
                </form>
              </div>
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-slate-400 text-center py-12">No inventory items yet.</p>
        )}
      </div>

      {inactive.length > 0 && (
        <details className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600">
            Inactive items ({inactive.length})
          </summary>
          <div className="divide-y divide-slate-100">
            {inactive.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <span className="text-sm text-slate-700">{item.name}</span>
                  <span className="text-xs text-slate-400 ml-2">
                    {Number(item.quantity)} {item.unit}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/admin/inventory/${item.id}`}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    History
                  </Link>
                  <ActionForm action={setItemActiveForm} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="active" value="true" />
                    <Button size="sm" variant="secondary">
                      Reactivate
                    </Button>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
