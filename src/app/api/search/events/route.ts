/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";

// keep query values clean + safe
// for dates, accept plain YYYY-MM-DD and normalize to ISO manually
const QuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(1000).default(25),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().min(0).max(49).default(0),
});

type NormalizedEvent = {
  id: string;
  title: string;
  start: string; // ISO or YYYY-MM-DD from TM
  ticketUrl?: string;
  priceRange?: { min?: number; max?: number; currency?: string };
  categories?: string[];
  imageUrl?: string;
  venue: {
    name: string;
    city?: string;
    coords?: { lat: number; lng: number };
  };
};

const TM_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";

// tiny in-memory cache (dev only)
const cache = new Map<string, { ts: number; data: any }>();
const TTL_MS = 1000 * 60 * 5; // 5m

// helper: always grab the largest image available
function pickImage(images: any[] | undefined): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url; // largest width
}


// date helpers
function toIsoNoMs(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z"); // drop .123Z
}
function ymdToLocalStart(s: string): Date {
  // s = "YYYY-MM-DD"
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0); // local 00:00
}
function ymdToLocalEnd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999); // local 23:59:59.999
}
function startIsoFromYMD(s?: string): string {
  // when no "from" is given, default to "now" (no ms)
  return s ? toIsoNoMs(ymdToLocalStart(s)) : toIsoNoMs(new Date());
}
function endIsoFromYMD(s?: string): string | undefined {
  return s ? toIsoNoMs(ymdToLocalEnd(s)) : undefined;
}

export async function GET(req: Request) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    // stop early if no API key configured
    return NextResponse.json({ error: "Missing TICKETMASTER_API_KEY" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // validated inputs
  const { q, lat, lng, radius, from, to, page } = parsed.data;

  // normalize date window in LOCAL time, then to UTC (no ms)
  let startISO = startIsoFromYMD(from);
  let endISO = endIsoFromYMD(to);

  // keep start <= end and cap window to ~180 days
  if (endISO && new Date(startISO) > new Date(endISO)) {
    const tmp = startISO;
    startISO = endISO;
    endISO = tmp;
  }
  if (endISO) {
    const MAX_WINDOW_MS = 1000 * 60 * 60 * 24 * 180;
    const delta = new Date(endISO).getTime() - new Date(startISO).getTime();
    if (delta > MAX_WINDOW_MS) {
      endISO = toIsoNoMs(new Date(new Date(startISO).getTime() + MAX_WINDOW_MS));
    }
  }

  // cache key uses normalized dates (not raw inputs)
  const nocache = url.searchParams.get("nocache") === "1";
  const cacheKey = JSON.stringify({ q, lat, lng, radius, startISO, endISO, page });
  if (!nocache) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return NextResponse.json(hit.data);
    }
  }

  // build TM query
  const params = new URLSearchParams();
  params.set("apikey", apiKey);
  params.set("size", "100");
  params.set("page", String(page));
  params.set("sort", "relevance,desc");
  params.set("locale", "*");
  if (q) params.set("keyword", q);
  if (lat !== undefined && lng !== undefined) {
    params.set("latlong", `${lat},${lng}`);
    params.set("radius", String(radius));
    params.set("unit", "km");
  }
  // always send start; send end only when available
  params.set("startDateTime", startISO);
  if (endISO) params.set("endDateTime", endISO);

  const tmUrl = `${TM_BASE}?${params.toString()}`;

  // quick debug hook (remove when done)
  if (url.searchParams.get("debug") === "1") {
    return NextResponse.json({ startISO, endISO, tmUrl });
  }

  // fetch from TM (prefer custom cache over fetch cache)
  const r = await fetch(tmUrl, { cache: "no-store" });
  if (!r.ok) {
    let details: unknown;
    try {
      details = await r.json();
    } catch {
      details = await r.text();
    }
    return NextResponse.json(
      { error: "Ticketmaster request failed", details, tmUrl },
      { status: r.status }
    );
  }
  const raw = await r.json();

  // normalize TM -> our shape
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
        priceRange: price
          ? { min: price.min, max: price.max, currency: price.currency }
          : undefined,
        categories,
        imageUrl: pickImage(ev.images),
        venue: {
          name: venue?.name,
          city: venue?.city?.name,
          coords:
            venue?.location?.latitude && venue?.location?.longitude
              ? {
                  lat: Number(venue.location.latitude),
                  lng: Number(venue.location.longitude),
                }
              : undefined,
        },
      };
    }) ?? [];

  // enforce window on our side too (TM can return extras)
  const startMs = new Date(startISO).getTime();
  const endMs = endISO ? new Date(endISO).getTime() : Number.POSITIVE_INFINITY;

  const filtered = events.filter((e) => {
    // e.start may be ISO or "YYYY-MM-DD"
    let ms = Date.parse(e.start);
    if (Number.isNaN(ms)) return false;

    // if date-only, treat as local end-of-day so it stays inside the intended day
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
      const [y, m, d] = e.start.split("-").map(Number);
      ms = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime();
    }
    return ms >= startMs && ms <= endMs;
  });

  // keep results sorted just in case
  filtered.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const pageInfo = {
    page: raw?.page?.number ?? 0,
    totalPages: raw?.page?.totalPages ?? 0,
    total: raw?.page?.totalElements ?? 0,
  };

  const data = { results: filtered, pageInfo };
  if (!nocache) cache.set(cacheKey, { ts: Date.now(), data });

  return NextResponse.json(data);
}
