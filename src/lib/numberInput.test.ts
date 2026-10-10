import { describe, it, expect } from "vitest";
import { formatNumberText, numberText } from "./numberInput";

describe("formatNumberText", () => {
  it("puts commas in the thousands as you type", () => {
    expect(formatNumberText("1")).toBe("1");
    expect(formatNumberText("1000")).toBe("1,000");
    expect(formatNumberText("18000")).toBe("18,000");
    expect(formatNumberText("1234567")).toBe("1,234,567");
  });

  it("keeps up to two decimals and a trailing dot while typing", () => {
    expect(formatNumberText("1250.5")).toBe("1,250.5");
    expect(formatNumberText("1250.567")).toBe("1,250.56");
    expect(formatNumberText("1250.")).toBe("1,250.");
    expect(formatNumberText(".5")).toBe(".5");
  });

  it("reformats text that already has commas, and drops anything that is not a number", () => {
    expect(formatNumberText("1,2,3,4,5")).toBe("12,345");
    expect(formatNumberText("₱ 18,000 abc")).toBe("18,000");
    expect(formatNumberText("1.2.3")).toBe("1.23");
  });

  it("trims leading zeros but keeps a lone zero", () => {
    expect(formatNumberText("007")).toBe("7");
    expect(formatNumberText("0")).toBe("0");
    expect(formatNumberText("0.50")).toBe("0.50");
  });

  it("can disallow decimals", () => {
    expect(formatNumberText("1250.5", false)).toBe("12,505");
  });
});

describe("numberText", () => {
  it("strips commas and spaces so the server can read the number", () => {
    expect(numberText("18,000.50")).toBe("18000.50");
    expect(numberText(" 1 250 ")).toBe("1250");
  });

  it("leaves other values alone", () => {
    expect(numberText(42)).toBe(42);
    expect(numberText(null)).toBeNull();
  });
});
