export type Point = { lat: number; lng: number };

/** Straight-line distance in km between two map pins (haversine). */
export function distanceKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** "850 m away", "3.2 km away", "42 km away". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round(km * 20) * 50)} m away`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

/** Nearest first; carts with no known pin go last, keeping their given order. */
export function sortNearest<T extends { distanceKm: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return 0;
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}
