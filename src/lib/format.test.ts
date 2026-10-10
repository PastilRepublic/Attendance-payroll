import { describe, it, expect } from "vitest";
import { formatPeso } from "./format";

describe("formatPeso", () => {
  it("shows pesos with thousands separators and two decimals", () => {
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(1234)).toBe("₱1,234.00");
    expect(formatPeso(350.5)).toBe("₱350.50");
    expect(formatPeso(1234567.891)).toBe("₱1,234,567.89");
  });

  it("puts a minus sign in front of negatives", () => {
    expect(formatPeso(-170)).toBe("−₱170.00");
  });
});

import { formatAmount, formatQty } from "./format";

describe("formatQty and formatAmount", () => {
  it("puts commas in quantities and keeps at most two decimals", () => {
    expect(formatQty(12000)).toBe("12,000");
    expect(formatQty(1250.5)).toBe("1,250.5");
    expect(formatQty(0)).toBe("0");
    expect(formatQty(10.256)).toBe("10.26");
  });

  it("shows an amount with commas and two decimals, without the sign or the peso mark", () => {
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatAmount(-150.5)).toBe("150.50");
  });
});
