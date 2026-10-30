/** India display defaults: Asia/Kolkata, DD-MM-YYYY, INR with en-IN grouping. */
export const IST = "Asia/Kolkata";

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inGrouping = new Intl.NumberFormat("en-IN");

function partsOf(fmt: Intl.DateTimeFormat, d: Date): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** 22-10-2026 */
export function formatDate(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = partsOf(dateParts, d);
  return `${p.day}-${p.month}-${p.year}`;
}

/** 22-10-2026 14:05 */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const t = partsOf(timeParts, d);
  return `${formatDate(d)} ${t.hour}:${t.minute}`;
}

/** ₹1,25,000.00 */
export function formatINR(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "";
  return inr.format(n);
}

/** 1,25,000 */
export function formatNumberIN(n: number): string {
  return inGrouping.format(n);
}

/** Calendar parts of an instant as seen in IST. */
export function istParts(d: Date): { year: number; month: number; day: number } {
  const p = partsOf(dateParts, d);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/** "YYYY-MM-DD" (IST calendar date) for <input type="date"> values. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = istParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
