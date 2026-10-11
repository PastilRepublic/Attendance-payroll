import ActionForm from "@/components/ActionForm";
import FormDialog from "@/components/ui/FormDialog";
import PillButton from "@/components/ui/PillButton";
import { inputClass } from "@/components/ui/styles";
import { renameTypeForm } from "./actions";

/**
 * "Edit my types": the types you added yourself, each with a box to fix the spelling. Saving
 * renames it everywhere it is used; renaming it to a type that already exists merges the two.
 */
export default function ManageTypesDialog({
  kind,
  types,
}: {
  kind: "expense" | "income";
  /** The types you added, with how many lines use each. */
  types: { name: string; uses: number }[];
}) {
  const noun = kind === "expense" ? "types" : "sources";
  return (
    <FormDialog
      size="sm"
      triggerLabel={`Edit my ${noun}`}
      title={`Edit my ${noun}`}
      description={
        kind === "expense"
          ? "Fix a spelling or merge two types. Everything using the old name moves to the new one. To remove a type, rename it to another one, for example Other."
          : "Fix a spelling or merge two sources. Everything using the old name moves to the new one. To remove a source, rename it to another one, for example Direct customers."
      }
    >
      <ul className="divide-y divide-slate-100">
        {types.map((t) => (
          <li key={t.name} className="py-3">
            <div className="text-xs text-slate-500">
              Used in {t.uses} {t.uses === 1 ? "line" : "lines"}
            </div>
            <ActionForm action={renameTypeForm} closeDialogOnSuccess compactError className="mt-1 flex items-center gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="from" value={t.name} />
              <input name="to" defaultValue={t.name} required maxLength={30} aria-label={`New name for ${t.name}`} className={inputClass} />
              <PillButton size="sm">Save</PillButton>
            </ActionForm>
          </li>
        ))}
      </ul>
    </FormDialog>
  );
}
