// Land transfer cost calculator -- ค่าใช้จ่ายวันโอนที่ดิน สำหรับใช้ประกอบการยื่นกู้.
//
// Rates verified against government/bank sources on 2026-08-11 (see citations on each
// constant below). This file exists because getting this wrong is not cosmetic: it is
// used on real loan applications, and every listing this business sells is bare land
// (content/listings.json has no "has_structure" field at all today).
//
// THE ONE FACT THAT MATTERS MOST HERE: the 0.01% government fee-reduction stimulus
// (extended to 30 June 2570 per Cabinet resolution) does NOT apply to bare land. It only
// covers a residential unit -- house, condo, or land WITH a structure on it, price-capped
// at 7,000,000 baht. Every listing in this system is bare land, so the correct default
// for this business is the FULL 2% rate, not the promotional one. Defaulting to the promo
// rate would understate a real cost by up to ~66,000 baht on a 3M baht plot -- exactly
// the kind of number a loan officer or a buyer would catch and hold the seller to.
//
// Nothing here is legal advice. It is a same-day-usable estimate built from public rate
// tables; the Land Office computes the actual figure at the transfer appointment, and a
// tax officer's discretion on appraised value can move the final number.

/** @type {{rate:number, source:string, checkedAt:string}} */
export const TRANSFER_FEE = {
  rate: 0.02,
  note: "2% ของราคาประเมินหรือราคาซื้อขาย แล้วแต่ราคาใดสูงกว่า ปกติแบ่งจ่ายฝ่ายละครึ่ง",
  source: "กรมที่ดิน (dol.go.th) ผ่าน apthai.com/tidlor.com — ตรวจ 11 ส.ค. 2569",
};

export const MORTGAGE_FEE = {
  rate: 0.01,
  note: "1% ของวงเงินจำนอง (ถ้ามีการจำนองพร้อมโอน) ผู้ซื้อ/ผู้กู้เป็นผู้จ่าย",
  source: "เดียวกับค่าโอน",
};

// 30 มิ.ย. 2570 ตามมติ ครม. ต่ออายุมาตรการ (ยืนยันจากหลายแหล่งรวมถึง dol.go.th เอง) --
// แต่ "ไม่ใช้กับที่ดินเปล่า" คือเงื่อนไขที่ตัดสินใจว่าธุรกิจนี้ใช้ไม่ได้เลย ไม่ใช่แค่ราคาเกิน 7 ล้าน.
export const REDUCED_FEE_PROMO = {
  rate: 0.0001,
  expires: "2570-06-30",
  appliesToBareLand: false,
  conditions: [
    "ต้องมีสิ่งปลูกสร้าง (บ้าน/คอนโด/อาคาร) -- ที่ดินเปล่าไม่เข้าเกณฑ์ไม่ว่ากรณีใด",
    "ราคาซื้อขาย + ราคาประเมิน + วงเงินจำนอง ต้องไม่เกิน 7,000,000 บาท ทุกค่า",
    "ผู้ซื้อต้องสัญชาติไทย",
    "ต้องโอนกรรมสิทธิ์และจดจำนองในวันเดียวกัน",
  ],
  source: "มติ ครม., dol.go.th, thaipbs.or.th — ตรวจ 11 ส.ค. 2569",
};

export const STAMP_DUTY = {
  rate: 0.005,
  note: "0.5% ใช้แทนภาษีธุรกิจเฉพาะ เมื่อถือครองมาแล้วตั้งแต่ 5 ปีขึ้นไป (หรือมีชื่อในทะเบียนบ้านเกิน 1 ปี กรณีมีสิ่งปลูกสร้างเป็นที่อยู่อาศัยหลัก)",
};

export const SPECIFIC_BUSINESS_TAX = {
  rate: 0.033,
  note: "3.3% ของราคาประเมินหรือราคาขายแล้วแต่สูงกว่า ใช้เมื่อถือครองน้อยกว่า 5 ปี — เสียแล้วไม่ต้องเสียอากรแสตมป์ซ้ำ",
};

// Table is fixed by the Revenue Code, not part of the yearly-adjustable stimulus
// measures above -- it has not changed in decades, unlike TRANSFER_FEE/REDUCED_FEE_PROMO
// which are time-limited Cabinet resolutions and must be re-checked periodically.
const HOLDING_YEAR_DEDUCTION_PCT = { 1: 92, 2: 84, 3: 77, 4: 71, 5: 65, 6: 60, 7: 55 };
const DEDUCTION_PCT_8_PLUS = 50;

// พ.ศ. 2568 progressive personal income tax brackets, บาท (unchanged for 2569).
const TAX_BRACKETS = [
  { upTo: 150_000, rate: 0 },
  { upTo: 300_000, rate: 0.05 },
  { upTo: 500_000, rate: 0.10 },
  { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.20 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.30 },
  { upTo: Infinity, rate: 0.35 },
];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * ภาษีเงินได้บุคคลธรรมดา หัก ณ ที่จ่าย ตอนขายที่ดิน.
 *
 * The method is the part people get wrong: it is not "appraised value × bracket rate".
 * It is deduct-by-years, divide by years-held to get an average YEARLY figure, tax THAT
 * figure through the normal progressive brackets, then multiply the resulting tax back up
 * by the number of years held. Skipping the divide/multiply step overstates the real tax
 * by several times on anything held more than a couple of years.
 *
 * @param {number} appraisedValue  ราคาประเมินราชการ (ไม่ใช่ราคาตลาด)
 * @param {number} yearsHeld       ปีที่ถือครอง (เศษของปีนับเป็น 1 ปีเต็มเสมอ)
 */
export function withholdingTax(appraisedValue, yearsHeld) {
  const years = Math.max(1, Math.ceil(yearsHeld));
  const deductionPct = HOLDING_YEAR_DEDUCTION_PCT[years] ?? DEDUCTION_PCT_8_PLUS;
  const netAfterDeduction = appraisedValue * (1 - deductionPct / 100);
  const averagePerYear = netAfterDeduction / years;

  let tax = 0;
  let lower = 0;
  for (const bracket of TAX_BRACKETS) {
    if (averagePerYear <= lower) break;
    const taxableInBand = Math.min(averagePerYear, bracket.upTo) - lower;
    tax += taxableInBand * bracket.rate;
    lower = bracket.upTo;
  }

  return {
    years_held: years,
    deduction_pct: deductionPct,
    net_after_deduction: round2(netAfterDeduction),
    average_per_year: round2(averagePerYear),
    tax_per_year: round2(tax),
    total_withholding_tax: round2(tax * years),
  };
}

/**
 * ค่าใช้จ่ายวันโอนทั้งหมด สำหรับที่ดิน (มีหรือไม่มีสิ่งปลูกสร้าง).
 *
 * @param {object} input
 * @param {number} input.appraisedValue    ราคาประเมินราชการ (ใช้เป็นฐานคำนวณเสมอ ไม่ใช่ราคาตลาด)
 * @param {number} [input.salePrice]       ราคาซื้อขายจริง ถ้าสูงกว่าราคาประเมินให้ใช้ตัวนี้แทนในค่าโอน/SBT/อากร
 * @param {number} input.yearsHeld         ปีที่เจ้าของถือครองมาแล้ว
 * @param {boolean} [input.hasStructure]   มีบ้าน/สิ่งปลูกสร้างบนที่ดินไหม -- ตัวตัดสินสิทธิ์มาตรการ 0.01%
 * @param {boolean} [input.willMortgage]   จะจดจำนองพร้อมโอนวันเดียวกันไหม
 * @param {number} [input.mortgageAmount]  วงเงินจำนอง (ถ้า willMortgage)
 * @param {"individual"|"company"} [input.sellerType]  บุคคลธรรมดา (มีภาษีหัก ณ ที่จ่ายแบบขั้นบันได) หรือนิติบุคคล (หัก 1% คงที่ ไม่อยู่ในสโคปไฟล์นี้)
 */
export function calculateTransferCosts(input) {
  const {
    appraisedValue,
    salePrice,
    yearsHeld,
    hasStructure = false,
    willMortgage = false,
    mortgageAmount = 0,
  } = input ?? {};

  if (!appraisedValue || appraisedValue <= 0) {
    throw new Error("ต้องระบุราคาประเมินราชการ (appraisedValue) เป็นตัวเลขมากกว่า 0");
  }
  if (yearsHeld === undefined || yearsHeld === null) {
    throw new Error("ต้องระบุปีที่ถือครอง (yearsHeld) เพื่อคำนวณภาษีธุรกิจเฉพาะ/อากรแสตมป์และภาษีหัก ณ ที่จ่าย");
  }

  const base = Math.max(appraisedValue, salePrice ?? 0);

  // Eligibility check for the 0.01% promo. Bare land fails this on the first condition,
  // every time -- stated explicitly rather than silently applying the full rate, so the
  // reason is visible to whoever reads the result.
  const promoBlockers = [];
  if (!hasStructure) promoBlockers.push("ที่ดินเปล่า ไม่มีสิ่งปลูกสร้าง (เงื่อนไขนี้ตัดสิทธิ์เสมอ)");
  if (base > 7_000_000) promoBlockers.push(`ราคา/ประเมิน ${base.toLocaleString("th-TH")} บาท เกิน 7,000,000 บาท`);
  const promoEligible = promoBlockers.length === 0;

  const transferFeeRate = promoEligible ? REDUCED_FEE_PROMO.rate : TRANSFER_FEE.rate;
  const transferFee = round2(base * transferFeeRate);

  let mortgageFee = 0;
  if (willMortgage && mortgageAmount > 0) {
    const mortgageRate = promoEligible ? REDUCED_FEE_PROMO.rate : MORTGAGE_FEE.rate;
    mortgageFee = round2(mortgageAmount * mortgageRate);
  }

  // Stamp duty and Specific Business Tax are mutually exclusive: SBT applies below the
  // 5-year mark, stamp duty from year 5 onward, and paying one means never paying both.
  const usesSbt = yearsHeld < 5;
  const stampDuty = usesSbt ? 0 : round2(base * STAMP_DUTY.rate);
  const specificBusinessTax = usesSbt ? round2(base * SPECIFIC_BUSINESS_TAX.rate) : 0;

  const wht = input.sellerType === "company"
    ? { total_withholding_tax: round2(base * 0.01), note: "นิติบุคคล: หัก 1% คงที่ ของราคาประเมินหรือราคาขายแล้วแต่สูงกว่า" }
    : withholdingTax(base, yearsHeld);

  const totalBuyerSide = round2(transferFee / 2 + mortgageFee);
  const totalSellerSide = round2(transferFee / 2 + stampDuty + specificBusinessTax + wht.total_withholding_tax);

  return {
    base_value: base,
    promo: {
      eligible: promoEligible,
      blockers: promoBlockers,
      note: REDUCED_FEE_PROMO.note ?? null,
      expires: REDUCED_FEE_PROMO.expires,
    },
    transfer_fee: { rate: transferFeeRate, amount: transferFee, split_each_side: round2(transferFee / 2) },
    mortgage_fee: willMortgage ? { rate: promoEligible ? REDUCED_FEE_PROMO.rate : MORTGAGE_FEE.rate, amount: mortgageFee } : null,
    stamp_duty: usesSbt ? null : { rate: STAMP_DUTY.rate, amount: stampDuty },
    specific_business_tax: usesSbt ? { rate: SPECIFIC_BUSINESS_TAX.rate, amount: specificBusinessTax } : null,
    withholding_tax: wht,
    total_buyer_pays: totalBuyerSide,
    total_seller_pays: totalSellerSide,
    grand_total: round2(totalBuyerSide + totalSellerSide),
    disclaimer:
      "ประมาณการจากอัตราสาธารณะที่ตรวจสอบล่าสุด 11 ส.ค. 2569 ไม่ใช่คำแนะนำทางกฎหมาย " +
      "ราคาประเมินจริงและดุลยพินิจเจ้าหน้าที่ ณ วันโอนอาจต่างจากนี้ได้ ควรยืนยันตัวเลขจริงกับสำนักงานที่ดินก่อนยื่นกู้",
  };
}
