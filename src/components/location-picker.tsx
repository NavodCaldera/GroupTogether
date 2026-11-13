"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";
import { SL_BOUNDS, SL_CENTER, inSriLanka } from "@/lib/location";

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";

type Leaflet = typeof import("leaflet");
declare global {
  interface Window {
    L?: Leaflet;
  }
}

/** Leaflet is ~40 KB and only needed here, so it loads from a CDN when the map first shows. */
function loadLeaflet(): Promise<Leaflet> {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-leaflet]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${LEAFLET}/leaflet.css`;
      css.dataset.leaflet = "1";
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = `${LEAFLET}/leaflet.js`;
    s.onload = () => (window.L ? resolve(window.L) : reject(new Error("Map failed to load")));
    s.onerror = () => reject(new Error("Map failed to load"));
    document.head.appendChild(s);
  });
}

type Suggestion = { name: string; detail: string; lat: number; lng: number };

/** Photon (OpenStreetMap search, free, built for type-ahead) limited to Sri Lankan places. */
async function searchPlaces(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const { latMin, latMax, lngMin, lngMax } = SL_BOUNDS;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&bbox=${lngMin},${latMin},${lngMax},${latMax}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features: {
      geometry: { coordinates: [number, number] };
      properties: {
        name?: string;
        state?: string;
        district?: string;
        countrycode?: string;
        type?: string;
      };
    }[];
  };
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const f of data.features) {
    const { name, state, district, countrycode } = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    if (!name || countrycode?.toUpperCase() !== "LK" || !inSriLanka(lat, lng)) continue;
    const detail = [district, state].filter((x) => x && x !== name).join(", ");
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, detail, lat, lng });
  }
  return out;
}

export type LocationDefaults = {
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/**
 * Address, city and an exact map pin, like choosing a pick-up point in PickMe: tap the map, drag
 * the pin, or use the device location. Submits `address`, `city`, `lat` and `lng`; the pin is
 * required (the server checks it too).
 */
export function LocationPicker({
  defaults,
  errors = {},
  addressLabel = "Delivery address",
  addressHint,
}: {
  defaults?: LocationDefaults | null;
  errors?: Record<string, string[] | undefined>;
  addressLabel?: string;
  addressHint?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const place = useRef<(lat: number, lng: number, pan?: boolean) => void>(() => {});
  const flyTo = useRef<(lat: number, lng: number, zoom: number) => void>(() => {});
  const [city, setCity] = useState(defaults?.city ?? "");
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    defaults?.lat != null && defaults?.lng != null
      ? { lat: defaults.lat, lng: defaults.lng }
      : null,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const initial = useRef(pin);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !el.current) return;
        const start = initial.current ?? SL_CENTER;
        map = L.map(el.current).setView([start.lat, start.lng], initial.current ? 16 : 11);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);
        let marker: import("leaflet").Marker | undefined;
        const set = (lat: number, lng: number, pan = false) => {
          if (!inSriLanka(lat, lng)) {
            setNote("That spot is outside Sri Lanka. Move the pin to your address.");
            return;
          }
          setNote("");
          setPin({ lat, lng });
          if (!marker) {
            marker = L.marker([lat, lng], { draggable: true }).addTo(map!);
            marker.on("dragend", () => {
              const p = marker!.getLatLng();
              set(p.lat, p.lng);
            });
          } else marker.setLatLng([lat, lng]);
          if (pan) map!.setView([lat, lng], Math.max(map!.getZoom(), 16));
        };
        place.current = set;
        flyTo.current = (lat, lng, zoom) => map!.setView([lat, lng], zoom);
        map.on("click", (e) => set(e.latlng.lat, e.latlng.lng));
        if (initial.current) set(initial.current.lat, initial.current.lng);
      })
      .catch(() => setNote("The map could not load. Check your connection and reload the page."));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  // Suggest places while typing and move the map to the best match (the pin is still the user's).
  useEffect(() => {
    const q = city.trim();
    if (!typed.current || q.length < 3) return setOptions([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, ctl.signal)
        .then((list) => {
          setOptions(list);
          setActive(-1);
          if (list[0]) flyTo.current(list[0].lat, list[0].lng, 13);
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [city]);

  function choose(o: Suggestion) {
    typed.current = false;
    setCity(o.name);
    setOptions([]);
    setOpen(false);
    flyTo.current(o.lat, o.lng, 15);
  }

  function locate() {
    if (!navigator.geolocation)
      return setNote("This device cannot share its location. Tap the map instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        place.current(p.coords.latitude, p.coords.longitude, true);
      },
      () => {
        setBusy(false);
        setNote("Could not get your location. Tap the map to drop the pin.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label={addressLabel} name="address" error={errors.address} hint={addressHint}>
        <Input
          name="address"
          autoComplete="street-address"
          defaultValue={defaults?.address ?? ""}
          required
        />
      </Field>
      <Field
        label="City"
        name="city"
        error={errors.city}
        hint="Start typing your town; pick it to jump to it on the map"
      >
        <div className="relative flex flex-col">
          <Input
            name="city"
            autoComplete="off"
            placeholder="Colombo"
            value={city}
            onChange={(e) => {
              typed.current = true;
              setCity(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!open || options.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % options.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
              } else if (e.key === "Enter" && active >= 0) {
                e.preventDefault();
                choose(options[active]);
              } else if (e.key === "Escape") setOpen(false);
            }}
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-autocomplete="list"
            aria-controls="city-options"
            required
          />
          {open && options.length > 0 && (
            <ul
              id="city-options"
              role="listbox"
              className="absolute top-full z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-paper py-1 shadow-lg"
            >
              {options.map((o, i) => (
                <li
                  key={`${o.name}${o.detail}${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-muted" : "hover:bg-muted"}`}
                >
                  <span className="font-medium">{o.name}</span>
                  {o.detail && <span className="text-subtle"> · {o.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">Pin your exact location</span>
          <button
            type="button"
            onClick={locate}
            disabled={busy}
            className="min-h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {busy ? "Locating…" : "Use my location"}
          </button>
        </div>
        <div
          ref={el}
          role="application"
          aria-label="Map. Tap to drop a pin on your address."
          // isolate: Leaflet's panes (z 400) and controls (z 1000) stay inside the map, under the header and tab bar
          className="isolate h-64 w-full overflow-hidden rounded-lg border border-line bg-muted sm:h-72"
        />
        <input type="hidden" name="lat" value={pin?.lat ?? ""} />
        <input type="hidden" name="lng" value={pin?.lng ?? ""} />
        {pin ? (
          <p className="text-xs text-subtle">
            Pin set ({pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}). Drag it to adjust.
          </p>
        ) : (
          <p className="text-xs text-subtle">Tap the map where the driver should come. Required.</p>
        )}
        {note && (
          <p className="text-xs font-medium text-danger" role="alert">
            {note}
          </p>
        )}
        {(errors.lat || errors.lng) && (
          <p className="text-xs font-medium text-danger" role="alert">
            {(errors.lat ?? errors.lng)?.[0]}
          </p>
        )}
      </div>
    </div>
  );
}
