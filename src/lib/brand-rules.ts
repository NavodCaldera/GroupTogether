import { D, toD } from "./decimal";

/**
 * Luxury brands (product owner, 2026-10-24): a brand publishes each discounted product with its
 * actual price, the discount price a piece we buy at, and a link to the product on its own
 * website that shows the actual price. Our shop shows the actual price with that link. Pure rules.
 */

type Money = { toString(): string };

/** Whole percent off the actual price (rounded down); null when there is no saving. */
export function discountPct(actual: Money, discounted: Money): number | null {
  const a = toD(actual);
  const d = toD(discounted);
  if (a.lte(0) || d.gte(a)) return null;
  return a.minus(d).div(a).times(100).toDecimalPlaces(0, D.ROUND_DOWN).toNumber();
}

/** What we pay the brand: the discount price × pieces. */
export function brandOfferTotal(offerPrice: Money, pieces: number): D {
  return toD(offerPrice).times(pieces);
}

const host = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

/** A secure link (https) on the brand's own website or one of its subdomains. */
export function linkOnSite(url: string, website: string | null | undefined): boolean {
  const link = host(url);
  if (!link) return false;
  if (!website) return true;
  const site = host(website);
  return !!site && (link === site || link.endsWith(`.${site}`));
}

/** "spaceylon.com" from a link, for the "See it on …" label. */
export function siteName(url: string): string {
  return host(url) ?? url;
}
