/** Parse cells copied from Excel/Sheets (tab-separated rows): strips ₹, commas, %, spaces and "days". */
export function parsePastedGrid(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split("\t").map((c) => c.trim().replace(/[₹,%\s]|days?/gi, "")));
}
