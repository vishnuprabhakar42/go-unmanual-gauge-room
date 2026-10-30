/**
 * GST on purchase orders. Intra-state supply (vendor state = plant state) → CGST + SGST (half each);
 * inter-state → IGST. Money is handled in integer paise; tax is computed per line and rounded to paise.
 */
export type TaxLine = { rate: number; gstPercent: number; qty?: number };
export type PoTotals = { subtotal: number; cgst: number; sgst: number; igst: number; gstAmount: number; total: number };

const toPaise = (rupees: number) => Math.round(rupees * 100);
const fromPaise = (p: number) => p / 100;

export function isInterState(
  supplierStateCode: string | null | undefined,
  placeOfSupplyStateCode: string | null | undefined,
): boolean {
  if (!supplierStateCode || !placeOfSupplyStateCode) return false; // unknown → treat as intra-state; editable later
  return supplierStateCode !== placeOfSupplyStateCode;
}

export function computeTotals(lines: readonly TaxLine[], interState: boolean): PoTotals {
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of lines) {
    const taxable = toPaise(l.rate) * (l.qty ?? 1);
    subtotal += taxable;
    if (interState) igst += Math.round((taxable * l.gstPercent) / 100);
    else {
      const half = Math.round((taxable * l.gstPercent) / 200);
      cgst += half;
      sgst += half;
    }
  }
  const gst = cgst + sgst + igst;
  return {
    subtotal: fromPaise(subtotal),
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    gstAmount: fromPaise(gst),
    total: fromPaise(subtotal + gst),
  };
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering: crore, lakh, thousand. */
function integerWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** 125050.5 → "Rupees One Lakh Twenty-Five Thousand Fifty and Fifty Paise Only" */
export function amountInWordsINR(amount: number): string {
  const paiseTotal = Math.round(amount * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  return `Rupees ${integerWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ""} Only`;
}
