import { NextResponse } from "next/server";
import { z } from "zod";

// ensure clean values after parsing
const QuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(200).default(25),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().min(0).max(49).default(0),
});

// normalized ticketmaster payload
type NormalizedEvent = {
  id: string;
  title: string;
  start: string;
  ticketUrl?: string;
  priceRange?: { min?: number; max?: number; currency?: string };
  categories?: string[];
  imageUrl?: string; // ← NEW
  venue: {
    name: string;
    city?: string;
    coords?: { lat: number; lng: number };
  };
};

// helper: pick an image around a target width
function pickImage(images: any[] | undefined, target = 400): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const sorted = [...images].sort((a, b) => {
    const da = Math.abs((a.width ?? target) - target);
    const db = Math.abs((b.width ?? target) - target);
    return da - db;
  });
  return sorted[0]?.url;
}


const TM_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";

const cache = new Map<string, { ts: number; data: any }>();
const TTL_MS = 1000 * 60 * 5; // 5 minutes

export async function GET(req: Request) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    // bail if no key
    return NextResponse.json({ error: "Missing TICKETMASTER_API_KEY" }, { status: 500 });
  }
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }
  // destrcture the values already typed by zod
  const { q, lat, lng, radius, from, to, page } = parsed.data;

  const key = JSON.stringify({ q, lat, lng, radius, from, to, page });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  // construct ticketmaster query params
  const params = new URLSearchParams();
  params.set("apikey", apiKey);
  params.set("size", "20");
  params.set("page", String(page));
  params.set("sort", "date,asc");
  params.set("locale", "*");
  if (q) params.set("keyword", q);
  // if user did not give coordinates, ticketmaster will use looser keyword search
  if (lat !== undefined && lng !== undefined) {
    params.set("latlong", `${lat},${lng}`);
    params.set("radius", String(radius));
    params.set("unit", "km");
  }
  if (from) params.set("startDateTime", new Date(from).toISOString());
  if (to) params.set("endDateTime", new Date(to).toISOString());

  const tmUrl = `${TM_BASE}?${params.toString()}`;
  // rely on our cache, not global
  const r = await fetch(tmUrl, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json({ error: "Ticketmaster request failed" }, { status: r.status });
  }
  const raw = await r.json();

  /**
   * Normalizer:
   * Grab first price range
   * Choose first venue
   * Build categories from genre + segment
   * Prefer dateTime, fallback to localDate
   * Parse venue coords if available
   */
  const events: NormalizedEvent[] =
    raw?._embedded?.events?.map((ev: any): NormalizedEvent => {
      const price = Array.isArray(ev.priceRanges) ? ev.priceRanges[0] : undefined;
      const venue = ev?._embedded?.venues?.[0];
      const categories = [
        ...(ev.classifications?.map((c: any) => c?.segment?.name).filter(Boolean) ?? []),
        ...(ev.classifications?.map((c: any) => c?.genre?.name).filter(Boolean) ?? []),
      ].filter(Boolean);

    return {
      id: ev.id,
      title: ev.name,
      start: ev.dates?.start?.dateTime ?? ev.dates?.start?.localDate ?? "",
      ticketUrl: ev.url,
      priceRange: price ? { min: price.min, max: price.max, currency: price.currency } : undefined,
      categories,
      imageUrl: pickImage(ev.images), // ← NEW
      venue: {
        name: venue?.name,
        city: venue?.city?.name,
        coords: venue?.location?.latitude && venue?.location?.longitude
          ? { lat: Number(venue.location.latitude), lng: Number(venue.location.longitude) }
          : undefined,
      },
    };
    }) ?? [];

  const pageInfo = {
    page: raw?.page?.number ?? 0,
    totalPages: raw?.page?.totalPages ?? 0,
    total: raw?.page?.totalElements ?? 0,
  };

  const data = { results: events, pageInfo };
  cache.set(key, { ts: Date.now(), data });
  return NextResponse.json(data);

}
