/** One OpenStreetMap tile with the pin drawn at its exact spot; no map script needed. */
export function MapPin({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const zoom = 16;
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const [tx, ty] = [Math.floor(x), Math.floor(y)];
  const left = ((x - tx) * 100).toFixed(2);
  const top = ((y - ty) * 100).toFixed(2);
  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block size-48 shrink-0 overflow-hidden rounded-lg border border-line bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`}
        alt={`Map: ${label}`}
        width={256}
        height={256}
        loading="lazy"
        className="size-full"
      />
      <span
        aria-hidden
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-danger shadow"
        style={{ left: `${left}%`, top: `${top}%` }}
      />
    </a>
  );
}

export function place(p: { name: string | null; company?: string | null }) {
  return p.company || p.name || "";
}
