import { useEffect, useRef, useState } from "react";

export type SensedPlace = {
  latitude: number;
  longitude: number;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  pincode?: string;
  label?: string;
};

type MapsWindow = Window & { google?: { maps: GoogleMaps } };

type GoogleMaps = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
  Marker: new (opts: Record<string, unknown>) => GoogleMarker;
  Geocoder: new () => { geocode: (req: Record<string, unknown>, cb: (results: GeocodeResult[] | null, status: string) => void) => void };
};

type GoogleMap = {
  panTo: (pos: { lat: number; lng: number }) => void;
  setCenter: (pos: { lat: number; lng: number }) => void;
};

type GoogleMarker = { setPosition: (pos: { lat: number; lng: number }) => void };

type AddressPart = { long_name: string; types: string[] };
type GeocodeResult = { formatted_address?: string; address_components?: AddressPart[]; geometry?: { location?: { lat: () => number; lng: () => number } } };

type PostalOffice = { Name: string; District: string; State: string; Block?: string; BranchType?: string; DeliveryStatus?: string };

const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

function component(parts: AddressPart[] | undefined, ...types: string[]) {
  return parts?.find((part) => types.some((type) => part.types.includes(type)))?.long_name || "";
}

let mapsPromise: Promise<void> | null = null;

function loadMaps() {
  if (!mapsKey) return Promise.reject(new Error("missing key"));
  if ((window as MapsWindow).google?.maps) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(script);
    });
  }
  return mapsPromise;
}

function digits(value?: string) {
  return (value || "").replace(/\D/g, "");
}

async function lookupPin(pin: string): Promise<SensedPlace | null> {
  const postal = fetch(`https://api.postalpincode.in/pincode/${pin}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json() as Array<{ Status?: string; PostOffice?: PostalOffice[] }>;
      const offices = body?.[0]?.Status === "Success" ? body[0].PostOffice || [] : [];
      const head = offices.find((office) => office.BranchType === "Head Post Office")
        || offices.find((office) => office.DeliveryStatus === "Delivery" && office.BranchType === "Sub Post Office")
        || offices[0];
      if (!head) return null;
      const block = head.Block && head.Block !== "NA" ? head.Block : "";
      const village = block || head.Name;
      const district = head.District;
      const state = head.State;
      return { village, district, state, address: [village, district, state].filter(Boolean).join(", ") };
    })
    .catch(() => null);

  if (mapsKey) {
    try {
      await loadMaps();
      const google = (window as MapsWindow).google;
      if (google?.maps) {
        const found = await new Promise<SensedPlace | null>((resolve) => {
          new google.maps.Geocoder().geocode({ address: `${pin}, India`, componentRestrictions: { country: "IN" } }, (results, status) => {
            const hit = status === "OK" ? results?.[0] : undefined;
            const location = hit?.geometry?.location;
            if (!location) { resolve(null); return; }
            const parts = hit?.address_components;
            resolve({
              latitude: location.lat(),
              longitude: location.lng(),
              address: hit?.formatted_address || "",
              village: component(parts, "locality", "administrative_area_level_3"),
              district: component(parts, "administrative_area_level_2"),
              state: component(parts, "administrative_area_level_1"),
              pincode: pin,
              label: hit?.formatted_address || pin,
            });
          });
        });
        if (found) {
          const names = await postal;
          return { ...found, address: names?.address || found.address, village: names?.village || found.village, district: names?.district || found.district, state: names?.state || found.state };
        }
      }
    } catch { /* fall through to the public pincode lookup */ }
  }

  const [names, geo] = await Promise.all([
    postal,
    fetch(`https://nominatim.openstreetmap.org/search?postalcode=${pin}&country=India&format=jsonv2&limit=1`)
      .then(async (response) => response.ok ? await response.json() as Array<{ lat: string; lon: string; display_name?: string }> : [])
      .catch(() => [] as Array<{ lat: string; lon: string; display_name?: string }>),
  ]);
  const hit = geo[0];
  if (!hit) return names ? { latitude: Number.NaN, longitude: Number.NaN, ...names, pincode: pin, label: [names.village, names.district, names.state].filter(Boolean).join(", ") } : null;
  return {
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
    address: names?.address || "",
    village: names?.village || "",
    district: names?.district || "",
    state: names?.state || "",
    pincode: pin,
    label: [names?.village, names?.district, names?.state].filter(Boolean).join(", ") || hit.display_name || pin,
  };
}

export function LocationPicker({ pincode, onPlace }: { pincode?: string; latitude?: number; longitude?: number; onPlace: (place: SensedPlace) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<GoogleMap | null>(null);
  const marker = useRef<GoogleMarker | null>(null);
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  const pin = digits(pincode);
  const ready = pin.length === 6;
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState("Enter a 6-digit pincode and Google Maps will place it.");

  useEffect(() => {
    if (!ready) {
      setPos(null);
      setStatus(pin.length ? "Enter all 6 digits of the pincode." : "Enter a 6-digit pincode and Google Maps will place it.");
      return;
    }
    let cancelled = false;
    setStatus(`Finding ${pin} on Google Maps…`);
    void lookupPin(pin).then((place) => {
      if (cancelled || !place) {
        if (!cancelled) setStatus("That pincode could not be placed. Check the digits and try again.");
        return;
      }
      if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) setPos({ lat: place.latitude, lng: place.longitude });
      onPlaceRef.current(place);
      setStatus(place.label ? `${pin} · ${place.label}` : `Showing ${pin} on Google Maps.`);
    });
    return () => { cancelled = true; };
  }, [pin, ready]);

  useEffect(() => {
    if (!mapsKey || !ready || !pos || !mapRef.current) return;
    let cancelled = false;
    void loadMaps().then(() => {
      if (cancelled || !mapRef.current) return;
      const google = (window as MapsWindow).google;
      if (!google?.maps) return;
      if (!mapObj.current) {
        mapObj.current = new google.maps.Map(mapRef.current, {
          center: pos,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        marker.current = new google.maps.Marker({ position: pos, map: mapObj.current });
      } else {
        mapObj.current.setCenter(pos);
        marker.current?.setPosition(pos);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [pos, ready]);

  const embed = ready ? `https://maps.google.com/maps?q=${encodeURIComponent(`${pin}, India`)}&z=14&output=embed` : "";

  return (
    <div className="space-y-3 md:col-span-2">
      <p className="text-sm font-medium">Location on Google Maps</p>
      {mapsKey && ready && pos ? (
        <div ref={mapRef} className="h-64 w-full overflow-hidden rounded-3xl bg-orange-50" />
      ) : ready ? (
        <iframe title={`Google Maps for pincode ${pin}`} className="h-64 w-full rounded-3xl border-0" src={embed} />
      ) : (
        <div className="flex h-64 items-center justify-center rounded-3xl bg-orange-50 px-6 text-center text-sm text-ink/70">The map appears here after a 6-digit pincode.</div>
      )}
      <p className="text-sm text-ink/70">{status}</p>
    </div>
  );
}
