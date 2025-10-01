'use client';

import { Loader } from '@googlemaps/js-api-loader';
import { useEffect, useRef } from 'react';

type Props = {
  value: string; // controlled text in the input (what user sees)
  onChange: (s: string) => void; // update the input value as user types
  onSelect: (place: { desc: string; lat: number; lng: number }) => void; // fires when a city is picked
  placeholder?: string;
  className?: string;
};

export default function CitySearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search city',
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = useRef<google.maps.MapsEventListener | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !inputRef.current) return; // no key or no input = bail

    // load Google Maps JS + Places library once
    const loader = new Loader({
      apiKey: key,
      version: 'weekly',
      libraries: ['places'],
    });

    let cancelled = false;

    loader.load().then(() => {
      if (cancelled || !inputRef.current) return;

      // create the autocomplete instance and lock it to cities
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['(cities)'], // only city-level results
        fields: ['geometry.location', 'formatted_address', 'name'], // only what we need
      });

      // when a place is chosen from the dropdown, push lat/lng up to parent
      listenerRef.current = autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current!.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;

        const lat = loc.lat();
        const lng = loc.lng();
        const desc = place.formatted_address || place.name || `${lat}, ${lng}`;

        // hand the selection to parent
        onSelect({ desc, lat, lng });
      });
    });

    // clean up on unmount
    return () => {
      cancelled = true;
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }
      autocompleteRef.current = null;
    };
  }, [onSelect]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        className ||
        'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'
      }
      autoComplete="off"
    />
  );
}
