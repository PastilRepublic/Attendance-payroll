import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  createItemForm,
  recordStockMovementForm,
  setItemActiveForm,
  updateItemForm,
} from "./actions";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import Badge from "@/components/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PillButton from "@/components/ui/PillButton";

const categoryLabels: Record<string, string> = {
  INGREDIENT: "Ingredient",
  PRODUCT: "Product",
  PACKAGING: "Packaging",
};

const INPUT = "rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200";
const INPUT_SM = "rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200";

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
      <SoftHeader title="Inventory" description="Ingredients, products, and packaging on hand." />

      <details className="mb-6 rounded-3xl border border-slate-300 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-slate-800">
          + New Item
        </summary>
        <ActionForm
          action={createItemForm}
          resetOnSuccess
          className="p-5 pt-0 flex flex-wrap items-end gap-3"
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
          <PillButton>Add Item</PillButton>
        </ActionForm>
      </details>

      <div className="space-y-3">
        {sorted.map((item) => {
          const isLow = Number(item.quantity) <= Number(item.lowStockThreshold);
          return (
            <SoftCard key={item.id} accent={isLow ? "red" : "none"}>
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
                <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200">
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
                  <PillButton size="sm">Record</PillButton>
                </ActionForm>
              </details>

              <details className="mt-2">
                <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200">
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
                  <PillButton size="sm">Save</PillButton>
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
                <ActionForm compactError action={setItemActiveForm}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="active" value="false" />
                  <ConfirmSubmitButton
                    message={`Deactivate ${item.name}? It disappears from this list, but it and its history stay saved and you can bring it back.`}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Deactivate
                  </ConfirmSubmitButton>
                </ActionForm>
              </div>
            </SoftCard>
          );
        })}
        {sorted.length === 0 && (
          <EmptyState>No inventory items yet. Open “New Item” above to add the first one.</EmptyState>
        )}
      </div>

      {inactive.length > 0 && (
        <details className="mt-8 rounded-3xl border border-slate-300 bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-slate-700">
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
                    <PillButton size="sm" variant="secondary">
                      Reactivate
                    </PillButton>
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
