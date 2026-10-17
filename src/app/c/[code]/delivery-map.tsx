"use client";

import { useEffect, useRef, useState } from "react";
import { loadLeaflet } from "@/components/location-picker";

/**
 * Read-only map of the delivery point. Members see the exact pin; everyone else gets an
 * approximate area (the server already rounded the coordinates), drawn as a circle.
 */
export function DeliveryMap({
  lat,
  lng,
  exact,
}: {
  lat: number;
  lng: number;
  exact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !el.current) return;
        map = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lng], exact ? 16 : 13);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);
        if (exact) L.marker([lat, lng]).addTo(map);
        else L.circle([lat, lng], { radius: 800 }).addTo(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [open, lat, lng, exact]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-11 w-fit items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted sm:min-h-10"
      >
        {open ? "Hide delivery point" : "See delivery point on map"}
      </button>
      {open && (
        <>
          <div
            ref={el}
            role="application"
            aria-label="Map of the delivery point"
            className="h-64 w-full overflow-hidden rounded-lg border border-line bg-muted"
          />
          {!exact && (
            <p className="text-xs text-subtle">
              Approximate area only. The exact spot is shown to members once you join.
            </p>
          )}
        </>
      )}
    </div>
  );
}
