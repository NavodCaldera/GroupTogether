const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Ticked cart items (variant ids) from a query or form value: comma-separated or repeated.
 * Undefined when the value is blank (the whole cart); empty when it names no valid id. */
export function parseItems(v: string | string[] | null | undefined): string[] | undefined {
  const raw = (Array.isArray(v) ? v : [v ?? ""]).flatMap((s) => String(s).split(","));
  const given = raw.map((s) => s.trim()).filter(Boolean);
  if (!given.length) return undefined;
  return [...new Set(given.filter((s) => ID.test(s)))].slice(0, 200);
}
