// Finds a new Venue's place: Photon first (fuzzy, finds informal names), Nominatim as the fallback.
// Called once per new Venue; the Venue is the cache. Either service is switched off by setting its
// URL var to "" in wrangler.jsonc. Research: .scratch/dance-calendar-mvp/research/geocoding-venues.md

export type Place = { label: string; address: string; lat: number; lng: number };

// Kassel/Göttingen, for Photon's location bias.
const FOCUS = { lat: 51.4, lon: 9.7 };

export async function geocode(env: Env, query: string): Promise<Place | null> {
  if (!query.trim()) return null;
  return (await photon(env, query).catch(failed("photon"))) ?? (await nominatim(env, query).catch(failed("nominatim")));
}

const failed = (service: string) => (err: unknown) => {
  console.error(`${service} geocoding failed`, err);
  return null;
};

const headers = (env: Env) => ({ "user-agent": `DanceCalendar (${env.PUBLIC_URL})` });

async function photon(env: Env, query: string): Promise<Place | null> {
  if (!env.PHOTON_URL) return null;
  const url = new URL("/api/", env.PHOTON_URL);
  url.search = new URLSearchParams({ q: query, lat: String(FOCUS.lat), lon: String(FOCUS.lon), limit: "1", lang: "de" }).toString();
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) throw new Error(`${res.status}`);
  const { features } = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
  };
  if (!features?.length) return null;
  const p = features[0].properties;
  const [lng, lat] = features[0].geometry.coordinates;
  return place(p.name, [p.street, p.housenumber], [p.postcode, p.city ?? p.town ?? p.village], lat, lng);
}

async function nominatim(env: Env, query: string): Promise<Place | null> {
  if (!env.NOMINATIM_URL) return null;
  const url = new URL("/search", env.NOMINATIM_URL);
  url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "de", addressdetails: "1" }).toString();
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) throw new Error(`${res.status}`);
  const results = (await res.json()) as { lat: string; lon: string; name?: string; address: Record<string, string | undefined> }[];
  if (!results.length) return null;
  const r = results[0];
  const a = r.address;
  return place(r.name, [a.road, a.house_number], [a.postcode, a.city ?? a.town ?? a.village], Number(r.lat), Number(r.lon));
}

function place(name: string | undefined, street: (string | undefined)[], town: (string | undefined)[], lat: number, lng: number): Place {
  const address = [street.filter(Boolean).join(" "), town.filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { label: [name, address].filter(Boolean).join(", "), address, lat, lng };
}
