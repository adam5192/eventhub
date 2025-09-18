'use client';

import { Loader } from "@googlemaps/js-api-loader";
import { useEffect, useRef } from "react";

export type MapEvent = {
  id: string;
  title: string;
  venue?: { coords?: { lat: number; lng: number } };
};

type Props = {
  center: { lat: number; lng: number };
  events: MapEvent[];
  zoom?: number;
};

export default function EventsMap({ center, events, zoom = 11 }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !divRef.current) return;

    const loader = new Loader({
      apiKey: key,
      version: "weekly",
      libraries: ["places"],
    });

    let cancelled = false;

    loader.load().then(() => {
      if (cancelled || !divRef.current) return;

      // Create / reuse map
      mapRef.current =
        mapRef.current ??
        new google.maps.Map(divRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

      mapRef.current.setCenter(center);

      // Clear old markers
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      // Add markers for events with coords
      events.forEach((e) => {
        const pos = e.venue?.coords;
        if (!pos) return;
        const marker = new google.maps.Marker({
          position: pos,
          map: mapRef.current!,
          title: e.title,
        });
        markersRef.current.push(marker);
      });
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, [center.lat, center.lng, zoom, events]);

  return <div ref={divRef} className="h-80 w-full rounded-xl border border-gray-700" />;
}
