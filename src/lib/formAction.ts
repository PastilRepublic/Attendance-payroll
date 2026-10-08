import { unstable_rethrow } from "next/navigation";

/** What a form action reports back to <ActionForm>: an error to show, or that it saved. */
export type FormState = { error?: string; savedAt?: number };

/**
 * Turns whatever a server action threw into a message fit for the form. In
 * production Next.js hides the message of an error thrown out of a server
 * action, so actions used by <ActionForm> return it instead of throwing.
 * Validation (zod) errors give their first issue; database errors get a
 * generic line so internals never reach the screen.
 */
export function formMessage(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    const first = (err as { issues: { message?: string }[] }).issues[0];
    if (first?.message) return first.message;
  }
  if (err instanceof Error) {
    if (err.name.startsWith("PrismaClient") || /prisma/i.test(err.message)) {
      return "Something went wrong saving that. Please try again.";
    }
    if (err.message) return err.message;
  }
  return "Something went wrong. Please try again.";
}

/**
 * Runs a server action's body and reports the outcome as form state. Next's
 * own control-flow errors (redirect, not-found) are passed through untouched.
 */
export async function runForm(body: () => Promise<unknown>): Promise<FormState> {
  try {
    await body();
    return { savedAt: Date.now() };
  } catch (err) {
    unstable_rethrow(err);
    return { error: formMessage(err) };
  }
}
