/**
 * Awaits Prisma queries one after another. Inside an interactive transaction all queries share one
 * connection, and `Promise.all` would issue them concurrently on it (deprecated in pg, removed in pg@9).
 * Prisma queries are lazy thenables, so building the array doesn't start them; awaiting does.
 */
export async function sequential<const P extends readonly unknown[]>(
  queries: P,
): Promise<{ -readonly [K in keyof P]: Awaited<P[K]> }> {
  const out: unknown[] = [];
  for (const q of queries) out.push(await q);
  return out as { -readonly [K in keyof P]: Awaited<P[K]> };
}
