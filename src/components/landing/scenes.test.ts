import { describe, expect, it } from "vitest";
import { computeScene, SCENES } from "./scenes";

// Guards the landing page: every example must balance and match its bills.
describe("landing scenes", () => {
  for (const scene of SCENES) {
    it(`${scene.label} balances`, () => {
      const r = computeScene(scene);
      expect(r.people.reduce((a, p) => a + p.net, 0)).toBe(0);
      expect(r.people.reduce((a, p) => a + p.share, 0)).toBe(r.total);
      const billTotal = scene.bills.reduce((a, b) => a + b.amount, 0) * 100;
      expect(r.total).toBe(billTotal);
      for (const e of scene.expenses) if (e.bill) expect(scene.bills[e.bill - 1].amount).toBe(e.amount);
    });
  }
  it("prints the numbers used in copy", () => {
    for (const s of SCENES) {
      const r = computeScene(s);
      console.log(s.key, r.total, r.people.map((p) => `${p.name}:${p.share}/${p.net}`).join(" "), r.transfers.map((t) => `${t.fromMemberId}->${t.toMemberId}:${t.amount}`).join(" "));
    }
  });
});
