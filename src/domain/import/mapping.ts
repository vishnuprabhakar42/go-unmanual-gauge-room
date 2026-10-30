/**
 * Fuzzy header → field mapping. Score = best of exact synonym match, token containment and
 * bigram (Dice) similarity against every synonym; assignment is greedy by score, one column per field.
 */
import { IMPORT_FIELDS, type ImportFieldKey } from "./fields";

export type ColumnMapping = Partial<Record<ImportFieldKey, number>>; // field → column index
export type MappingSuggestion = { mapping: ColumnMapping; scores: Partial<Record<ImportFieldKey, number>> };

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/no\./g, "no")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s/g, "");
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

export function dice(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      hits++;
      counts.set(g, c - 1);
    }
  }
  return (2 * hits) / (A.length + B.length);
}

export function scoreHeader(header: string, synonyms: readonly string[]): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of synonyms) {
    if (h === syn) return 1;
    const tokensH = h.split(" ");
    const tokensS = syn.split(" ");
    // all synonym tokens present as whole words (e.g. "last cal date dd mm yy" ⊇ "last cal date")
    if (tokensS.length > 1 && tokensS.every((t) => tokensH.includes(t))) best = Math.max(best, 0.9);
    best = Math.max(best, dice(h, syn) * 0.95);
  }
  return best;
}

export const MATCH_THRESHOLD = 0.62;

export function suggestMapping(headers: readonly string[], threshold = MATCH_THRESHOLD): MappingSuggestion {
  const candidates: { field: ImportFieldKey; col: number; score: number }[] = [];
  headers.forEach((header, col) => {
    for (const f of IMPORT_FIELDS) {
      const score = scoreHeader(header, f.synonyms);
      if (score >= threshold) candidates.push({ field: f.key, col, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  const mapping: ColumnMapping = {};
  const scores: MappingSuggestion["scores"] = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field] !== undefined || usedCols.has(c.col)) continue;
    mapping[c.field] = c.col;
    scores[c.field] = Math.round(c.score * 100) / 100;
    usedCols.add(c.col);
  }
  // A combined "range" column makes separate min/max redundant and vice versa.
  if (mapping.range !== undefined && (mapping.rangeMin !== undefined || mapping.rangeMax !== undefined)) {
    delete mapping.rangeMin;
    delete mapping.rangeMax;
  }
  return { mapping, scores };
}

/** Finds the header row: the first row (within the first 10) where at least 2 headers map. */
export function detectHeaderRow(rows: readonly (readonly string[])[]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const { mapping } = suggestMapping(rows[i]);
    if (Object.keys(mapping).length >= 2) return i;
  }
  return 0;
}
