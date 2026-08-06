import { toDate } from "./dates";

export type ListSort = "newest" | "oldest";

export type ListFilterValues = {
  q: string;
  userId: string;
  from: string;
  to: string;
  sort: ListSort;
};

export function parseListFilters(sp: {
  q?: string;
  userId?: string;
  from?: string;
  to?: string;
  sort?: string;
}): ListFilterValues {
  const sort: ListSort = sp.sort === "oldest" ? "oldest" : "newest";
  return {
    q: (sp.q || "").trim(),
    userId: (sp.userId || "").trim(),
    from: (sp.from || "").trim(),
    to: (sp.to || "").trim(),
    sort,
  };
}

export function hasActiveListFilters(f: ListFilterValues): boolean {
  return Boolean(f.q || f.userId || f.from || f.to || f.sort === "oldest");
}

/** Compara día calendario YYYY-MM-DD contra rango from/to. */
export function inDateRange(
  iso: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;

  let key = "";
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    key = iso.slice(0, 10);
  } else {
    const d = toDate(iso);
    if (!d) return false;
    key = d.toISOString().slice(0, 10);
  }

  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function matchesSearch(
  haystack: Array<string | number | null | undefined>,
  q: string
): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  return haystack.some((part) => String(part ?? "").toLowerCase().includes(needle));
}

export function compareByDate(
  aIso: string | null | undefined,
  bIso: string | null | undefined,
  sort: ListSort
): number {
  const a = aIso || "";
  const b = bIso || "";
  return sort === "oldest" ? a.localeCompare(b) : b.localeCompare(a);
}
