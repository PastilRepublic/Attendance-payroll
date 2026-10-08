import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  unstable_rethrow: (err: unknown) => {
    if (err && typeof err === "object" && "digest" in err) throw err;
  },
}));

import { z } from "zod";
import { formMessage, runForm } from "./formAction";

describe("formMessage", () => {
  it("uses the first validation message", () => {
    const parsed = z.object({ amount: z.number().max(10, "Amount must be 10 or less") }).safeParse({ amount: 11 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formMessage(parsed.error)).toBe("Amount must be 10 or less");
  });

  it("passes our own error messages through", () => {
    expect(formMessage(new Error("This payslip is finalized. Unlock it first to make changes."))).toBe(
      "This payslip is finalized. Unlock it first to make changes."
    );
  });

  it("hides database error details", () => {
    const err = new Error("Invalid `prisma.payslip.create()` invocation: column x does not exist");
    expect(formMessage(err)).toBe("Something went wrong saving that. Please try again.");
  });

  it("falls back for unknown throws", () => {
    expect(formMessage("boom")).toBe("Something went wrong. Please try again.");
  });
});

describe("runForm", () => {
  it("reports success and failure as form state", async () => {
    expect(await runForm(async () => {})).toMatchObject({ savedAt: expect.any(Number) });
    expect(await runForm(async () => { throw new Error("Nope"); })).toEqual({ error: "Nope" });
  });

  it("rethrows Next control-flow errors such as redirects", async () => {
    const redirectLike = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    await expect(runForm(async () => { throw redirectLike; })).rejects.toBe(redirectLike);
  });
});
