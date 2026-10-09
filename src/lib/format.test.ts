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
