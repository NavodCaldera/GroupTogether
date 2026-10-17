import { z } from "zod";

/** Rough bounding box of Sri Lanka; a pin outside it is almost certainly a mistake. */
export const SL_BOUNDS = { latMin: 5.8, latMax: 9.9, lngMin: 79.4, lngMax: 82.0 } as const;
export const SL_CENTER = { lat: 6.9271, lng: 79.8612 } as const; // Colombo

export function inSriLanka(lat: number, lng: number) {
  return (
    lat >= SL_BOUNDS.latMin &&
    lat <= SL_BOUNDS.latMax &&
    lng >= SL_BOUNDS.lngMin &&
    lng <= SL_BOUNDS.lngMax
  );
}

const coord = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Pin ${label} on the map`)
    .transform(Number)
    .pipe(z.number({ error: `Pin ${label} on the map` }).finite());

/** The map pin fields. Mandatory: an empty pin is an error. */
export const pinFields = { lat: coord("your location"), lng: coord("your location") };

/** Refinement for any object with `lat` and `lng`: the pin must be inside Sri Lanka. */
export const pinInSriLanka = (v: { lat: number; lng: number }) => inSriLanka(v.lat, v.lng);
export const pinOutsideMessage = { message: "The pin must be inside Sri Lanka", path: ["lat"] };

/** A delivery address plus the exact map pin. The pin is mandatory. */
export const locationSchema = z
  .object({
    address: z.string().trim().min(5, "Enter your delivery address").max(300),
    city: z.string().trim().min(2, "Enter your city").max(60),
    ...pinFields,
  })
  .refine(pinInSriLanka, pinOutsideMessage);

export type Location = z.infer<typeof locationSchema>;

/** Link a driver or admin can open to see the pin. */
export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
