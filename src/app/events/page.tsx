/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import EventsMap, { MapEvent } from "../components/EventsMap";
import Image from "next/image";
import CitySearchInput from "../components/CitySearchInput";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import { useRef } from "react";

type EventCard = {
  id: string;
  title: string;
  start: string;
  ticketUrl?: string;
  priceRange?: { min?: number; max?: number; currency?: string };
  categories?: string[];
  imageUrl?: string;
  venue: {
    name?: string;
    city?: string;
    coords?: { lat: number; lng: number };
  };
};

const TORONTO = { lat: 43.6532, lng: -79.3832 };

export default function EventsPage() {
  // toronto as default center
  const TORONTO = { lat: 43.6532, lng: -79.3832 };

  // search form state
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>(""); // "YYYY-MM-DD"
  const [to, setTo] = useState<string>("");
  const [radius, setRadius] = useState(25);

  // city search state
  const [city, setCity] = useState("Toronto, ON");
  const [center, setCenter] = useState(TORONTO);

  // data + ui state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventCard[]>([]);

  // For demo: fixed center. (Later we’ll wire Places Autocomplete to setCenter.)
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("lat", String(center.lat));
    p.set("lng", String(center.lng));
    p.set("radius", String(radius));
    if (from) p.set("from", from); // send "YYYY-MM-DD"
    if (to)   p.set("to", to);     // send "YYYY-MM-DD"
    return p.toString();
  }, [q, center.lat, center.lng, radius, from, to]);

  const lastControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async () => {
    // cancel any in-flight request (user typed again)
    if (lastControllerRef.current) {
      lastControllerRef.current.abort();
    }
    const controller = new AbortController();
    lastControllerRef.current = controller;

    setError(null);
    setLoading(true);

    try {
      const r = await fetch(`/api/search/events?${queryString}`, {
        signal: controller.signal,
      });
      const json = await r.json();
      if (!r.ok) {
        const msg =
          json?.details?.fault?.faultstring ||
          json?.error ||
          "Search failed";
        throw new Error(msg);
      }
      const results = (json.results || []) as EventCard[];

      // optional: client-side sort proxy for popularity
      results.sort((a, b) => (b.priceRange?.max ?? 0) - (a.priceRange?.max ?? 0));

      setEvents(results);
    } catch (e: any) {
      // fetch abort is expected when user types quickly; ignore
      if (e?.name !== "AbortError") {
        setError(e?.message || "Search failed");
      }
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  // fire a search only after the user pauses typing for 500ms
  useDebouncedEffect(
    () => {
      search();
      // cleanup: nothing special here
      return;
    },
    [queryString], // runs when q/from/to/radius/center change
    600 // bump to 600–800ms if still too chatty
  );

  // also run once on first mount
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    // selecting a city updates center
    search();
  }, [center, search]);

  const handleCitySelect = useCallback(
    (place: { desc: string; lat: number; lng: number }) => {
      setCity(place.desc);        // update the text in the input
      setCenter({ lat: place.lat, lng: place.lng }); // map + API center
    }, []
  );


  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold tracking-tight">Find events</h1>
      <p className="mt-1 text-sm text-gray-500">
        City: <span className="font-medium">{city}</span> (map center). Try a keyword like “rock” or “comedy”.
      </p>

      {/* Controls */}
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-6 text-gray-500">
        {/* City picker (2 columns on md+) */}
        <div className="md:col-span-2">
          <CitySearchInput
            value={city}
            onChange={setCity}
            onSelect={handleCitySelect}
            placeholder="Search city (e.g., New York)"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>

        {/* Keyword (1 col) */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Keyword (optional)"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* From date (1 col) */}
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* To date (1 col) */}
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Radius (km) (1 col) */}
        <div className="relative">
          <input
            type="number"
            min={1}
            max={200}
            value={radius}
            onChange={(e) => {
              const val = Number(e.target.value);
              // clamp between 1 and 200
              if (val < 1) setRadius(1);
              else if (val > 200) setRadius(200);
              else setRadius(val);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Distance (km)"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm">
            km
          </span>
        </div>

        {/* Search button (full width on small screens) */}
        <button
          onClick={search}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition"
          disabled={loading}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>


      {/* Map */}
      <div className="mt-6">
        <EventsMap
          center={center}
          events={events as unknown as MapEvent[]}
          zoom={11}
        />
      </div>

      {/* Errors */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && events.length === 0 && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-300">
          No events found. Try a different keyword, a larger radius, or another date.
        </div>
      )}
      <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 [grid-auto-rows:1fr]">
        {events.map((ev) => (
          <li key={ev.id} className="h-full">
            <article
              className="
                h-full rounded-xl border border-zinc-800/60 bg-zinc-900/60
                hover:border-zinc-700 hover:shadow-lg hover:-translate-y-0.5
                transition duration-200
                p-4
              "
            >
              <div className="flex h-full gap-4">
                {/* Thumbnail */}
                <div className="relative hidden sm:block w-32 shrink-0 overflow-hidden rounded-lg">
                  {ev.imageUrl ? (
                    <Image
                      src={ev.imageUrl}
                      alt={ev.title}
                      width={800}
                      height={450}
                      className="w-full h-48 object-cover rounded-t-lg"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-zinc-700" />
                  )}
                </div>

                {/* Content */}
                <div className="flex min-h-[7rem] flex-1 flex-col">
                  {/* Title + CTA */}
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base sm:text-lg font-semibold text-white leading-snug">
                      {ev.title}
                    </h2>

                    {ev.ticketUrl && (
                      <a
                        href={ev.ticketUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="
                          inline-flex items-center gap-1 rounded-lg bg-blue-600
                          px-3 py-1.5 text-sm font-medium text-white
                          hover:bg-blue-500 focus-visible:outline-none
                          focus-visible:ring-2 focus-visible:ring-blue-400
                          focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900
                          transition
                        "
                      >
                        Tickets
                        <svg
                          viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                          className="opacity-90"
                        >
                          <path fill="currentColor"
                            d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z"/>
                        </svg>
                      </a>
                    )}
                  </div>

                  {/* Meta line: city — venue • date */}
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {ev.venue.city ? `${ev.venue.city} — ` : ""}
                    {ev.venue.name || "Unknown venue"} •{" "}
                    {ev.start
                      ? new Date(ev.start).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "TBA"}
                  </p>

                  {/* Badges / price near bottom */}
                  <div className="mt-2 flex-1" />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {Array.from(new Set(ev.categories ?? []))  // remove duplicates
                        .filter(Boolean)                         // skip empty values
                        .slice(0, 2)                             // only show first 2
                        .map((c) => (
                          <span
                            key={`${ev.id}-${c}`}                // stable + unique
                            className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-300"
                          >
                            {c}
                          </span>
                        ))}

                      {ev.priceRange && (
                        <span className="rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 text-xs">
                          {ev.priceRange.currency ?? ""}{" "}
                          {ev.priceRange.min ?? ""}
                          {ev.priceRange.max ? ` – ${ev.priceRange.max}` : ""}
                        </span>
                      )}
                    </div>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
