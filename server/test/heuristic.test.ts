import { describe, expect, it } from "vitest";
import { analyseHeuristically, findAmounts, findDates } from "../src/ai/heuristic.js";
import { carInsuranceRenewal, electricityBill, revenueLetter, ukBroadband } from "./fixtures/samples.js";

const NOW = new Date("2026-11-05T09:00:00Z");

describe("findDates", () => {
  it("reads day-first numeric, written and ISO dates", () => {
    const iso = findDates("pay by 18/11/2026, renew on 15 December 2026, or 3rd January 2027 or March 4, 2027 or 2027-02-01").map((d) => d.iso);
    expect(iso).toEqual(["2026-11-18", "2026-12-15", "2027-01-03", "2027-03-04", "2027-02-01"].sort((a, b) => iso.indexOf(a) - iso.indexOf(b)));
    expect(iso).toHaveLength(5);
  });
  it("rejects impossible dates", () => {
    expect(findDates("31/02/2026 and 13/13/2026")).toEqual([]);
  });
});

describe("findAmounts", () => {
  it("handles euro, sterling and thousands separators", () => {
    expect(findAmounts("€1,250.00 and £41.99 and 12.50 EUR").map((a) => [a.value, a.currency])).toEqual([
      [1250, "EUR"],
      [41.99, "GBP"],
      [12.5, "EUR"],
    ]);
  });
});

describe("analyseHeuristically", () => {
  it("understands an electricity bill", () => {
    const a = analyseHeuristically(electricityBill, NOW);
    expect(a.docType).toBe("bill");
    expect(a.provider).toBe("Electric Ireland");
    expect(a.amountDue).toMatchObject({ value: 184.62, currency: "EUR" });
    expect(a.deadlines[0]).toMatchObject({ kind: "payment", date: "2026-11-18", amount: 184.62 });
    expect(a.referenceNumbers.map((r) => r.label)).toEqual(expect.arrayContaining(["Account number", "MPRN"]));
    expect(a.summary).toContain("€184.62");
  });

  it("quotes where each date and amount came from", () => {
    const a = analyseHeuristically(electricityBill, NOW);
    expect(a.deadlines[0].evidence).toBe("This amount will be debited from your account on or after 18/11/2026.");
    expect(a.amountDue?.evidence).toBe("Total amount due: €184.62");
  });

  it("trims long lines around the match", () => {
    const long = `${"Lorem ipsum dolor sit amet ".repeat(8)}payment due by 18/11/2026 ${"and more words here ".repeat(8)}`;
    const ev = analyseHeuristically(long, NOW).deadlines[0].evidence!;
    expect(ev.length).toBeLessThanOrEqual(112);
    expect(ev).toContain("18/11/2026");
    expect(ev.startsWith("…") && ev.endsWith("…")).toBe(true);
  });

  it("flags an auto-renewing insurance price rise", () => {
    const a = analyseHeuristically(carInsuranceRenewal, NOW);
    expect(a.docType).toBe("renewal");
    expect(a.provider).toBe("AXA");
    expect(a.deadlines.map((d) => [d.kind, d.date])).toEqual(
      expect.arrayContaining([
        ["renewal", "2026-12-15"],
        ["cancellation_window", "2026-12-14"],
      ]),
    );
    expect(a.flags.join(" ")).toMatch(/renews automatically/);
    expect(a.flags.join(" ")).toMatch(/increase/i);
    expect(a.referenceNumbers[0]).toEqual({ label: "Policy number", value: "MTR/4471209" });
    expect(a.renewalTerms).toMatch(/renew automatically/);
  });

  it("classifies a Revenue LPT letter and its response deadline", () => {
    const a = analyseHeuristically(revenueLetter, NOW);
    expect(a.docType).toBe("tax_letter");
    expect(a.deadlines[0]).toMatchObject({ kind: "response", date: "2026-11-07" });
    expect(a.summary).toMatch(/routine/);
  });

  it("handles a forwarded UK email", () => {
    const a = analyseHeuristically(ukBroadband, NOW);
    expect(a.provider).toBe("BT");
    expect(a.deadlines[0]).toMatchObject({ kind: "expiry", date: "2027-01-03" });
    expect(a.amountDue?.currency).toBe("GBP");
  });
});
