import { NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';

type TMDBMovie = {
  id: number;
  title: string;
  overview: string;
  release_date?: string;
  poster_path?: string | null;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    if (!q) return NextResponse.json({ results: [] })

    const apiKey = process.env.TMDB_API_KEY;
    if(!apiKey) {
        return NextResponse.json({ error: 'Missing TMDB_API_KEY' }, { status: 500 });
    }

    // build TMDB url (server-side)
    const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(q)}&api_key=${apiKey}`
    
    // prevent caching while iterating, will be changed to smarter caching later
    const r = await fetch(url, { cache: 'no-store'});
    if (!r.ok) {
        return NextResponse.json({ error: 'TMDB request failed' }, { status: r.status });
    }
    const data = await r.json();

    type TMDBRaw = {
        id: number;
        title: string;
        overview?: string; // optional
        release_date?: string;
        poster_path?: string | null;
    };

    // normalize TMDB payload into array
    const results: TMDBMovie[] = (data.results ?? []).map((m: TMDBRaw) => ({
        id: m.id,
        title: m.title,
        overview: m.overview ?? "",   // explicitly handle missing overview
        release_date: m.release_date,
        poster_path: m.poster_path,
    }));



    return NextResponse.json({ results });
}