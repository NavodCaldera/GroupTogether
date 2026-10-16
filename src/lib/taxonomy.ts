/** Who a product is for, what it is, and which sizes that kind comes in. No database. */

export const AUDIENCES = [
  { id: "MEN", label: "Men" },
  { id: "WOMEN", label: "Women" },
  { id: "GIRL", label: "Girl" },
  { id: "BOY", label: "Boy" },
  { id: "KID", label: "Kid" },
] as const;

export type Audience = (typeof AUDIENCES)[number]["id"];

const SHOE_ADULT = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const SHOE_KID = ["UK 10", "UK 11", "UK 12", "UK 13", "UK 1", "UK 2", "UK 3"];
const LETTER = ["S", "M", "L", "XL", "XXL"];
const WAIST = ["28", "30", "32", "34", "36"];
const AGE_KID = ["2-3Y", "3-4Y", "4-5Y", "5-6Y"];
const AGE_JUNIOR = ["6-7Y", "8-9Y", "10-11Y", "12-13Y"];

type Kind = { id: string; label: string; category: "SHOES" | "APPAREL"; sizes: string[] };

const k = (id: string, label: string, category: Kind["category"], sizes: string[]): Kind => ({
  id,
  label,
  category,
  sizes,
});

/** Categories shown once an audience is picked. Ids are unique across audiences. */
export const KINDS: Record<Audience, Kind[]> = {
  MEN: [
    k("men-tshirts", "T-shirts", "APPAREL", LETTER),
    k("men-shirts", "Shirts", "APPAREL", LETTER),
    k("men-trousers", "Trousers", "APPAREL", WAIST),
    k("men-jeans", "Jeans", "APPAREL", WAIST),
    k("men-shorts", "Shorts", "APPAREL", LETTER),
    k("men-jackets", "Jackets & hoodies", "APPAREL", LETTER),
    k("men-sneakers", "Sneakers", "SHOES", SHOE_ADULT),
    k("men-formal", "Formal shoes", "SHOES", SHOE_ADULT),
    k("men-sandals", "Sandals & slippers", "SHOES", SHOE_ADULT),
  ],
  WOMEN: [
    k("women-tops", "T-shirts & tops", "APPAREL", LETTER),
    k("women-dresses", "Dresses", "APPAREL", LETTER),
    k("women-skirts", "Skirts", "APPAREL", LETTER),
    k("women-trousers", "Trousers & jeans", "APPAREL", LETTER),
    k("women-jackets", "Jackets & hoodies", "APPAREL", LETTER),
    k("women-sneakers", "Sneakers", "SHOES", SHOE_ADULT),
    k("women-heels", "Heels & flats", "SHOES", SHOE_ADULT),
    k("women-sandals", "Sandals & slippers", "SHOES", SHOE_ADULT),
  ],
  GIRL: [
    k("girl-tops", "T-shirts & tops", "APPAREL", AGE_JUNIOR),
    k("girl-dresses", "Dresses & skirts", "APPAREL", AGE_JUNIOR),
    k("girl-bottoms", "Trousers & shorts", "APPAREL", AGE_JUNIOR),
    k("girl-jackets", "Jackets & hoodies", "APPAREL", AGE_JUNIOR),
    k("girl-shoes", "Shoes & sneakers", "SHOES", SHOE_KID),
    k("girl-sandals", "Sandals & slippers", "SHOES", SHOE_KID),
  ],
  BOY: [
    k("boy-tshirts", "T-shirts & shirts", "APPAREL", AGE_JUNIOR),
    k("boy-bottoms", "Trousers & shorts", "APPAREL", AGE_JUNIOR),
    k("boy-jackets", "Jackets & hoodies", "APPAREL", AGE_JUNIOR),
    k("boy-shoes", "Shoes & sneakers", "SHOES", SHOE_KID),
    k("boy-sandals", "Sandals & slippers", "SHOES", SHOE_KID),
  ],
  KID: [
    k("kid-tops", "Tops", "APPAREL", AGE_KID),
    k("kid-bottoms", "Bottoms", "APPAREL", AGE_KID),
    k("kid-sets", "Sets & rompers", "APPAREL", AGE_KID),
    k("kid-shoes", "Shoes", "SHOES", SHOE_KID),
  ],
};

const ALL_KINDS = Object.values(KINDS).flat();

export const isAudience = (v: unknown): v is Audience => AUDIENCES.some((a) => a.id === v);

export const findKind = (id: string | null | undefined) => ALL_KINDS.find((x) => x.id === id);

/** Does this category belong to this audience? */
export const kindFits = (audience: Audience, kindId: string) =>
  KINDS[audience].some((x) => x.id === kindId);

/** Categories to offer: the audience's own, or every one when no audience is picked. */
export function kindsFor(audience: Audience | "" | undefined) {
  return audience ? KINDS[audience] : ALL_KINDS;
}

/** Sizes to offer for a category (empty when none is picked, so callers fall back to all sizes). */
export function sizesFor(kindId: string | undefined) {
  return findKind(kindId)?.sizes ?? [];
}
