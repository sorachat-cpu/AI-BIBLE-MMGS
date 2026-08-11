// Land transfer cost calculator tests. Numbers here are worked by hand against the
// published rate tables in src/lib/land-tax.mjs -- these are the checks that matter most
// in this whole file, since a wrong number here goes straight onto a loan application.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTransferCosts, withholdingTax } from "../src/lib/land-tax.mjs";

test("bare land is never eligible for the 0.01% promo, regardless of price", () => {
  const cheap = calculateTransferCosts({ appraisedValue: 500_000, yearsHeld: 3 });
  assert.equal(cheap.promo.eligible, false);
  assert.ok(cheap.promo.blockers[0].includes("ที่ดินเปล่า"));
  assert.equal(cheap.transfer_fee.rate, 0.02, "must fall back to the full 2% rate");
  assert.equal(cheap.transfer_fee.amount, 10_000);
});

test("a structure under the price cap is promo-eligible", () => {
  const r = calculateTransferCosts({ appraisedValue: 3_000_000, yearsHeld: 3, hasStructure: true });
  assert.equal(r.promo.eligible, true);
  assert.equal(r.promo.blockers.length, 0);
  assert.equal(r.transfer_fee.rate, 0.0001);
  assert.equal(r.transfer_fee.amount, 300);
});

test("a structure over 7,000,000 baht loses promo eligibility on price alone", () => {
  const r = calculateTransferCosts({ appraisedValue: 8_000_000, yearsHeld: 3, hasStructure: true });
  assert.equal(r.promo.eligible, false);
  assert.ok(r.promo.blockers.some((b) => b.includes("เกิน 7,000,000")));
  assert.equal(r.transfer_fee.amount, 160_000);
});

test("uses the sale price over the appraised value when it is higher", () => {
  const r = calculateTransferCosts({ appraisedValue: 1_000_000, salePrice: 1_500_000, yearsHeld: 6 });
  assert.equal(r.base_value, 1_500_000);
  assert.equal(r.transfer_fee.amount, 30_000);
});

test("specific business tax applies under 5 years, stamp duty from 5 years on -- never both", () => {
  const under5 = calculateTransferCosts({ appraisedValue: 2_000_000, yearsHeld: 4 });
  assert.equal(under5.specific_business_tax.amount, round(2_000_000 * 0.033));
  assert.equal(under5.stamp_duty, null);

  const at5 = calculateTransferCosts({ appraisedValue: 2_000_000, yearsHeld: 5 });
  assert.equal(at5.stamp_duty.amount, round(2_000_000 * 0.005));
  assert.equal(at5.specific_business_tax, null);
});

test("mortgage fee only appears when willMortgage is set, and follows the same promo rate", () => {
  const noMortgage = calculateTransferCosts({ appraisedValue: 1_000_000, yearsHeld: 6 });
  assert.equal(noMortgage.mortgage_fee, null);

  const withMortgage = calculateTransferCosts({
    appraisedValue: 1_000_000, yearsHeld: 6, willMortgage: true, mortgageAmount: 800_000,
  });
  assert.equal(withMortgage.mortgage_fee.rate, 0.01, "bare land, so full 1% not the 0.01% promo");
  assert.equal(withMortgage.mortgage_fee.amount, 8_000);
});

// This is the calculation people get wrong: deduct-by-year, DIVIDE by years held to get
// an annual average, tax that through the brackets, then MULTIPLY back up. Verified by
// hand against the published deduction table (92/84/77/71/65/60/55/50%).
test("withholding tax divides by years held before applying tax brackets, then multiplies back", () => {
  // 1 year, 92% deduction: net = 1,000,000 * 0.08 = 80,000. /1 year = 80,000/yr.
  // Bracket: first 150,000 is 0% -> tax/yr = 0. Total = 0.
  const oneYear = withholdingTax(1_000_000, 1);
  assert.equal(oneYear.deduction_pct, 92);
  assert.equal(oneYear.net_after_deduction, 80_000);
  assert.equal(oneYear.tax_per_year, 0);
  assert.equal(oneYear.total_withholding_tax, 0);

  // 5 years, 65% deduction, appraised 5,000,000: net = 5,000,000 * 0.35 = 1,750,000.
  // /5 years = 350,000/yr.
  // Brackets: 0-150k @0% = 0; 150k-300k @5% = 7,500; 300k-350k @10% = 5,000.
  // tax/yr = 12,500. total = 12,500 * 5 = 62,500.
  const fiveYears = withholdingTax(5_000_000, 5);
  assert.equal(fiveYears.net_after_deduction, 1_750_000);
  assert.equal(fiveYears.average_per_year, 350_000);
  assert.equal(fiveYears.tax_per_year, 12_500);
  assert.equal(fiveYears.total_withholding_tax, 62_500);

  // 10 years (past the table -> 50% deduction), appraised 10,000,000:
  // net = 5,000,000. /10 years = 500,000/yr.
  // Brackets: 0-150k@0=0; 150k-300k@5%=7,500; 300k-500k@10%=20,000. tax/yr=27,500.
  // total = 275,000.
  const tenYears = withholdingTax(10_000_000, 10);
  assert.equal(tenYears.deduction_pct, 50);
  assert.equal(tenYears.average_per_year, 500_000);
  assert.equal(tenYears.tax_per_year, 27_500);
  assert.equal(tenYears.total_withholding_tax, 275_000);
});

test("years held is always rounded up to a whole year, never zero", () => {
  const partial = withholdingTax(1_000_000, 0.3);
  assert.equal(partial.years_held, 1);
});

test("company seller uses the flat 1% rate instead of the progressive individual table", () => {
  const r = calculateTransferCosts({ appraisedValue: 2_000_000, yearsHeld: 3, sellerType: "company" });
  assert.equal(r.withholding_tax.total_withholding_tax, 20_000);
});

test("buyer and seller totals split the transfer fee in half each", () => {
  const r = calculateTransferCosts({ appraisedValue: 1_000_000, yearsHeld: 6 });
  assert.equal(r.transfer_fee.split_each_side, 10_000);
  assert.equal(r.total_buyer_pays, 10_000);
});

test("rejects missing appraised value or years held rather than silently computing zero", () => {
  assert.throws(() => calculateTransferCosts({ yearsHeld: 3 }), /ราคาประเมิน/);
  assert.throws(() => calculateTransferCosts({ appraisedValue: 1_000_000 }), /ปีที่ถือครอง/);
});

function round(n) {
  return Math.round(n * 100) / 100;
}
