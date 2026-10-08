import { describe, it, expect, vi, beforeEach } from "vitest";

const admin = {
  id: "a1",
  email: "Owner@Shop.com",
  active: true,
  passwordHash: "hash:secret123",
  passwordFailures: 0,
  passwordLockedUntil: null as Date | null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findFirst: vi.fn(async ({ where }: { where: { email: { equals: string } } }) =>
        where.email.equals.toLowerCase() === admin.email.toLowerCase() ? { ...admin } : null
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.passwordFailures && typeof data.passwordFailures === "object") {
          admin.passwordFailures += (data.passwordFailures as { increment: number }).increment;
        } else {
          Object.assign(admin, data);
        }
        return { ...admin };
      }),
    },
  },
}));
vi.mock("@/lib/pin", () => ({
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `hash:${pw}`),
}));

import { checkAdminPassword, AdminPasswordLockedError, MAX_PASSWORD_FAILURES } from "./adminPassword";

describe("checkAdminPassword lockout", () => {
  beforeEach(() => {
    Object.assign(admin, { passwordFailures: 0, passwordLockedUntil: null, active: true });
  });

  it("matches the email ignoring case and resets the count on success", async () => {
    await checkAdminPassword("owner@shop.com", "nope");
    expect(admin.passwordFailures).toBe(1);
    const ok = await checkAdminPassword("OWNER@shop.com", "secret123");
    expect(ok.admin?.id).toBe("a1");
    expect(admin.passwordFailures).toBe(0);
  });

  it("reports attempts left, then locks on the last wrong password and refuses the right one", async () => {
    const lefts: (number | null)[] = [];
    for (let i = 0; i < MAX_PASSWORD_FAILURES - 1; i++) {
      lefts.push((await checkAdminPassword("owner@shop.com", "nope")).attemptsLeft);
    }
    expect(lefts).toEqual([4, 3, 2, 1]);
    await expect(checkAdminPassword("owner@shop.com", "nope")).rejects.toBeInstanceOf(AdminPasswordLockedError);
    await expect(checkAdminPassword("owner@shop.com", "secret123")).rejects.toBeInstanceOf(AdminPasswordLockedError);
  });

  it("works again after the lock expires", async () => {
    admin.passwordLockedUntil = new Date(Date.now() - 1000);
    expect((await checkAdminPassword("owner@shop.com", "secret123")).admin?.id).toBe("a1");
    expect(admin.passwordLockedUntil).toBeNull();
  });

  it("just fails for unknown or deactivated accounts", async () => {
    expect(await checkAdminPassword("nobody@shop.com", "x")).toEqual({ admin: null, attemptsLeft: null });
    admin.active = false;
    expect(await checkAdminPassword("owner@shop.com", "secret123")).toEqual({ admin: null, attemptsLeft: null });
  });
});
