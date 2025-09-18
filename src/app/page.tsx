'use client';

import Image from 'next/image';
import { useState } from 'react';

// normalized shape returned by API route
type Movie = {
  id: number;
  title: string;
  overview: string;
  release_date?: string;
  poster_path?: string | null;
};

export default function HomePage() {
  // react state for search ui
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState<string | null>(null);

  // submit handler: calls the tmdb server route
  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true)
    try{
      const r = await fetch(`api/tmdb/search?q=${encodeURIComponent(q)}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'Search failed')
      setResults(json.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false)
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {process.env.NEXT_PUBLIC_APP_NAME || 'EventHub'}
      </h1>

      <p className='mt-1 text-sm text-gray-500'>
        Search for a movie title (e.g., <span className="italic">Shrek</span>).
      </p>

      <form onSubmit={onSearch} className='mt-6 flex gap-2'>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Search movies...'
          className='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-600'
        />

        <button 
          type="submit"
          disabled={loading || q.trim().length === 0}
          className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/** error box (only renders on error) */}
      {error && (
        <div className='mt-4 rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm'>
          {error}
        </div>
      )}

      {/** results grid */}
      <ul className='mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2'>
        {results.map((m) => (
          <li key={m.id} className='rounded-xl border border-gray-200 p-4'>
            {/** poster image */}
            <div className='flex gap-4'>
              {m.poster_path ? (
                <div className="relative h-28 w-20 overflow-hidden rounded-lg">
                  <Image
                    alt={m.title}
                    src={`https://image.tmdb.org/t/p/w300${m.poster_path}`}
                    fill
                    className='object-cover'
                    sizes="(max-width: 640px) 80px, 100px"
                  />
                </div>
              ) : (
                /** placeholder image */
                <div className='h-28 w-20 rounded-lg bg-gray-100' />
              )}
              {/** text column */}
              <div className='flex-1'>
                <h2 className='text-lg font-semibold'>{m.title}</h2>
                {/** meta line */}
                <p className='text-xs text-gray-500'>
                  {m.release_date || 'Unknown date'}
                </p>
                {/** overview */}
                <p className='mt-2 text-sm text-gray-700 line-clamp-3'>
                  {m.overview || 'No description available.'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

    </main>
    
  )
}