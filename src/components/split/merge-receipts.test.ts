import { describe, expect, it } from "vitest";
import type { ExtractedReceipt } from "@/server/ai/receipt";
import { mergeReceipts } from "./merge-receipts";

const receipt = (o: Partial<ExtractedReceipt>): ExtractedReceipt => ({
  kind: "receipt",
  merchant: null,
  category: null,
  date: null,
  currency: "INR",
  items: [],
  subtotal: null,
  tax: null,
  tip: null,
  suggestedTips: [],
  serviceCharge: null,
  discount: null,
  total: null,
  paidByHint: null,
  ...o,
});

describe("mergeReceipts", () => {
  it("labels lines by bill and adds up the charges", () => {
    const res = mergeReceipts([
      { receipt: receipt({ merchant: "Britto's", category: "food", date: "2026-10-10", items: [{ name: "Curry", quantity: 1, totalPrice: 700 }], subtotal: 700, tax: 35, total: 735 }), issues: [] },
      { receipt: receipt({ merchant: "Goa Cabs", category: "transport", items: [{ name: "Ride", quantity: 1, totalPrice: 170 }], tax: 30, total: 200 }), issues: [{ field: "total", message: "Check it" }] },
    ]);
    if ("error" in res) throw new Error(res.error);
    expect(res.receipt.merchant).toBe("Britto's + Goa Cabs");
    expect(res.receipt.items.map((i) => i.name)).toEqual(["Britto's · Curry", "Goa Cabs · Ride"]);
    expect(res.receipt).toMatchObject({ category: "food", date: "2026-10-10", tax: 65, total: 935, subtotal: null, tip: null });
    expect(res.issues[0].message).toBe("Goa Cabs: Check it");
  });

  it("refuses to combine bills in different currencies", () => {
    expect(mergeReceipts([{ receipt: receipt({ currency: "INR" }), issues: [] }, { receipt: receipt({ currency: "EUR" }), issues: [] }])).toEqual({
      error: expect.stringMatching(/different currencies/),
    });
  });
});
