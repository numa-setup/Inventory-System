// PostgREST caps every request at 1000 rows by default. A plain
// `supabase.from(t).select(...)` therefore SILENTLY returns only the first 1000
// rows once a table grows past that — the classic "products disappeared from
// Stock / POS / reports as the catalogue grew" bug. These helpers page through
// the whole result set so no row is ever dropped.
//
// IMPORTANT: give the query a STABLE, unique .order(...) inside `build` so the
// pages tile the table without overlaps or gaps (add a tie-breaker column when
// the primary sort key isn't unique).

const PAGE = 1000; // PostgREST's hard per-request cap

type QueryResult<T> = { data: T[] | null; error: unknown };

/** Fetch EVERY row of a query, 1000 at a time, and return them as one array. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<QueryResult<T>>,
  page = PAGE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break; // last page (fewer than a full page returned)
  }
  return out;
}

/**
 * Same as {@link fetchAll} but resolves to `{ data }`, so it drops straight into
 * existing `const [{ data }] = await Promise.all([...])` call sites in place of a
 * bare `supabase.from(...).select(...)` — keeping those reads parallel.
 */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<QueryResult<T>>,
  page = PAGE,
): Promise<{ data: T[] }> {
  return { data: await fetchAll<T>(build, page) };
}
