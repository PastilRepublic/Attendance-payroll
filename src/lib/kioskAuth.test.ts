import { describe, it, expect, vi, beforeEach } from "vitest";

const employee = {
  id: "e1",
  name: "Ana",
  pinHash: "hash:1234",
  active: true,
  pinFailures: 0,
  pinLockedUntil: null as Date | null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: {
      findUnique: vi.fn(async () => ({ ...employee })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.pinFailures && typeof data.pinFailures === "object") {
          employee.pinFailures += (data.pinFailures as { increment: number }).increment;
        } else {
          Object.assign(employee, data);
        }
        return { ...employee };
      }),
    },
  },
}));
vi.mock("@/lib/pin", () => ({
  verifyPin: vi.fn(async (pin: string, hash: string) => hash === `hash:${pin}`),
}));

import { resolveEmployeeByPin, resolveEmployeeOrLocked, PinLockedError, MAX_PIN_FAILURES } from "./kioskAuth";

describe("resolveEmployeeByPin lockout", () => {
  beforeEach(() => {
    Object.assign(employee, { pinFailures: 0, pinLockedUntil: null });
  });

  it("counts wrong PINs and locks after the limit, refusing even the correct PIN", async () => {
    for (let i = 0; i < MAX_PIN_FAILURES; i++) {
      expect(await resolveEmployeeByPin("0000", "e1")).toBeNull();
    }
    expect(employee.pinLockedUntil).not.toBeNull();
    await expect(resolveEmployeeByPin("1234", "e1")).rejects.toBeInstanceOf(PinLockedError);
  });

  it("a correct PIN resets the count", async () => {
    await resolveEmployeeByPin("0000", "e1");
    await resolveEmployeeByPin("0000", "e1");
    expect(employee.pinFailures).toBe(2);
    expect(await resolveEmployeeByPin("1234", "e1")).toEqual({ id: "e1", name: "Ana" });
    expect(employee.pinFailures).toBe(0);
  });

  it("lets the PIN work again once the lock has expired", async () => {
    employee.pinLockedUntil = new Date(Date.now() - 1000);
    expect(await resolveEmployeeByPin("1234", "e1")).toEqual({ id: "e1", name: "Ana" });
    expect(employee.pinLockedUntil).toBeNull();
  });
});

describe("resolveEmployeeOrLocked warnings", () => {
  beforeEach(() => {
    Object.assign(employee, { pinFailures: 0, pinLockedUntil: null });
  });

  it("stays quiet at first, warns when 3 attempts are left, then reports the lock on the last wrong PIN", async () => {
    const msgs: { status: number; error: string }[] = [];
    for (let i = 0; i < MAX_PIN_FAILURES; i++) {
      const { rejection } = await resolveEmployeeOrLocked("0000", "e1");
      msgs.push({ status: rejection!.status, error: (await rejection!.json()).error });
    }
    expect(msgs[0]).toEqual({ status: 401, error: "PIN not recognized" });
    expect(msgs[2]).toEqual({ status: 401, error: "PIN not recognized. You have 3 attempts left." });
    expect(msgs[4].error).toBe("PIN not recognized. You have 1 attempt left.");
    expect(msgs[5].status).toBe(429);
  });
});
