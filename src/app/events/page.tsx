'use client';

import { useEffect, useMemo, useState } from "react";
import EventsMap, { MapEvent } from "../components/EventsMap";
import Image from "next/image";

type EventCard = {
  id: string;
  title: string;
  start: string;
  ticketUrl?: string;
  priceRange?: { min?: number; max?: number; currency?: string };
  categories?: string[];
  venue: {
    name?: string;
    city?: string;
    coords?: { lat: number; lng: number };
  };
};

const TORONTO = { lat: 43.6532, lng: -79.3832 };

export default function EventsPage() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("Toronto, ON");
  const [center, setCenter] = useState(TORONTO);
  const [radius, setRadius] = useState(25);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  // For demo: fixed center. (Later we’ll wire Places Autocomplete to setCenter.)
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("lat", String(center.lat));
    p.set("lng", String(center.lng));
    p.set("radius", String(radius));
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to).toISOString());
    return p.toString();
  }, [q, center.lat, center.lng, radius, from, to]);

  const search = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/search/events?${queryString}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "Search failed");
      setEvents(json.results || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold tracking-tight">Find events</h1>
      <p className="mt-1 text-sm text-gray-500">
        City: <span className="font-medium">{city}</span> (map center). Try a keyword like “rock” or “comedy”.
      </p>

      {/* Controls */}
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Keyword (optional)"
          className="md:col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          min={1}
          max={200}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Radius (km)"
        />
        <button
          onClick={search}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
      <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 [grid-auto-rows:1fr]">
        {events.map((ev) => (
          <li key={ev.id} className="h-full">
            <div className="h-full rounded-xl border border-gray-200 p-4">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{ev.title}</h2>
                  {ev.ticketUrl ? (
                    <a
                      href={ev.ticketUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Tickets →
                    </a>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500">
                  {ev.venue.city ? `${ev.venue.city} — ` : ""}
                  {ev.venue.name || "Unknown venue"} • {ev.start || "TBA"}
                </p>

                {/* Spacer grows to fill card */}
                <div className="flex-1" />

                {ev.priceRange && (
                  <p className="mt-2 text-sm text-gray-700">
                    {ev.priceRange.currency ?? ""} {ev.priceRange.min ?? ""} – {ev.priceRange.max ?? ""}
                  </p>
                )}
                {ev.categories && ev.categories.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {ev.categories.slice(0, 3).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
