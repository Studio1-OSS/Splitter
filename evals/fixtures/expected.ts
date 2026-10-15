// Expected extraction for the sample bills in this folder. The images were generated for this repo
// (see evals/README.md), so they're free to use and redistribute.
import type { ExtractedReceipt } from "../../src/server/ai/receipt";

type Expected = Pick<ExtractedReceipt, "kind" | "merchant" | "currency" | "date" | "tax" | "total"> & {
  category: ExtractedReceipt["category"];
  items: { name: string; totalPrice: number }[];
};

export const receiptFixtures: { file: string; expected: Expected }[] = [
  {
    file: "receipt-beach-shack.png",
    expected: {
      kind: "receipt",
      merchant: "Britto's Beach Shack",
      category: "food",
      currency: "INR",
      date: "2026-10-10",
      tax: 162,
      total: 3402,
      items: [
        { name: "Prawn Curry", totalPrice: 1400 },
        { name: "Kingfisher 650ml", totalPrice: 1200 },
        { name: "Fish Thali", totalPrice: 480 },
        { name: "Fresh Lime Soda", totalPrice: 160 },
      ],
    },
  },
  {
    file: "receipt-party-decor.png",
    expected: {
      kind: "receipt",
      merchant: "Party Mart",
      category: "party",
      currency: "INR",
      date: "2026-10-12",
      tax: null,
      total: 1250,
      items: [
        { name: "Balloons", totalPrice: 450 },
        { name: "Happy 30th banner", totalPrice: 350 },
        { name: "Candles", totalPrice: 150 },
        { name: "Paper plates", totalPrice: 300 },
      ],
    },
  },
  {
    file: "hotel-invoice.pdf",
    expected: {
      kind: "invoice",
      merchant: "Casa Anjuna",
      category: "accommodation",
      currency: "INR",
      date: "2026-10-11",
      tax: 1008,
      total: 9408,
      items: [
        { name: "Deluxe room, sea view", totalPrice: 7600 },
        { name: "Breakfast buffet", totalPrice: 800 },
      ],
    },
  },
  {
    file: "taxi-1.png",
    expected: { kind: "receipt", merchant: "Goa Cabs", category: "transport", currency: "INR", date: "2026-10-09", tax: 30, total: 200, items: [] },
  },
  {
    file: "note-handwritten.png",
    expected: {
      kind: "handwritten_note",
      merchant: null,
      category: null,
      currency: null,
      date: null,
      tax: null,
      total: 750,
      items: [
        { name: "Mahima drinks", totalPrice: 500 },
        { name: "Priya snacks", totalPrice: 250 },
      ],
    },
  },
  {
    file: "not-a-bill.png",
    expected: { kind: "not_a_bill", merchant: null, category: null, currency: null, date: null, tax: null, total: null, items: [] },
  },
];
