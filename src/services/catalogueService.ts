import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import type { Actor, Genre, Movie, MovieSummary } from "../types/catalogue.js";

const genreSelect = { id: true, name: true, slug: true };
const movieSummarySelect = { id: true, title: true, posterUrl: true, releaseYear: true };

// Everything a movie page or an embedding needs. `actors` is renamed to `cast` on the way out.
const fullMovieSelect = {
  ...movieSummarySelect,
  overview: true,
  backdropUrl: true,
  runtime: true,
  trailerUrl: true,
  genres: { select: genreSelect, orderBy: { name: "asc" } },
  actors: { select: { id: true, name: true, profileUrl: true }, orderBy: { name: "asc" } },
  // `satisfies` checks this against Prisma's select type while keeping the literal "asc". A
  // plain const widens it to string, and `as const` makes it readonly; Prisma rejects both.
} satisfies Prisma.MovieSelect;

function toMovie<T extends { actors: Actor[] }>({ actors, ...rest }: T) {
  return { ...rest, cast: actors };
}

export function listGenres(): Promise<Genre[]> {
  return prisma.genre.findMany({ select: genreSelect, orderBy: { name: "asc" } });
}

export async function browse(): Promise<{ genre: Genre; movies: MovieSummary[] }[]> {
  const genres = await prisma.genre.findMany({
    where: { movies: { some: {} } },
    select: genreSelect,
    orderBy: { name: "asc" },
  });

  const placed = new Set<string>();
  const rows: { genre: Genre; movies: MovieSummary[] }[] = [];

  for (const genre of genres) {
    const movies = await prisma.movie.findMany({
      where: { genres: { some: { id: genre.id } }, id: { notIn: [...placed] } },
      select: movieSummarySelect,
      orderBy: [{ popularity: "desc" }, { id: "asc" }],
      take: 20,
    });

    for (const movie of movies) {
      placed.add(movie.id);
    }

    if (movies.length > 0) {
      rows.push({ genre, movies });
    }
  }

  return rows;
}

// Films by id, returned in the order the ids were given. That order is a ranking the caller
// computed, so losing it would throw away the only thing that made the list worth requesting.
// Unknown ids are skipped rather than erroring: one stale id must not empty a row.
export async function moviesByIds(ids: string[], view: "summary" | "full") {
  if (ids.length === 0) {
    return { items: [] };
  }

  if (view === "full") {
    const rows = await prisma.movie.findMany({
      where: { id: { in: ids } },
      select: fullMovieSelect,
    });
    const byId = new Map(rows.map((row) => [row.id, toMovie(row)]));

    return { items: ids.map((id) => byId.get(id)).filter((movie) => movie !== undefined) };
  }

  const rows = await prisma.movie.findMany({
    where: { id: { in: ids } },
    select: movieSummarySelect,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  return { items: ids.map((id) => byId.get(id)).filter((movie) => movie !== undefined) };
}

// Title, cast and genre, because those are the three things a person types into a search box.
// One OR rather than three queries: the database is better at this than we are.
const searchSelect = {
  ...movieSummarySelect,
  popularity: true,
  actors: { select: { name: true } },
} satisfies Prisma.MovieSelect;

// Where a match happened decides how good it is. A film whose title is what you typed beats one
// that merely contains it, which beats one that only shares an actor or a genre.
function rank(movie: { title: string; actors: { name: string }[] }, needle: string): number {
  const title = movie.title.toLowerCase();

  if (title === needle) {
    return 4;
  }

  if (title.startsWith(needle)) {
    return 3;
  }

  if (title.includes(needle)) {
    return 2;
  }

  if (movie.actors.some((actor) => actor.name.toLowerCase().includes(needle))) {
    return 1;
  }

  return 0;
}

// Ranking happens here rather than in SQL because every match is already in memory: a substring
// search over a thousand films cannot return more than a thousand rows. At a catalogue where it
// could, this becomes a tsvector column and an ORDER BY ts_rank, and the shape stays the same.
export async function searchMovies(query: string, limit: number) {
  const needle = query.toLowerCase();
  const rows = await prisma.movie.findMany({
    where: {
      OR: [
        { title: { contains: needle, mode: "insensitive" } },
        { actors: { some: { name: { contains: needle, mode: "insensitive" } } } },
        { genres: { some: { name: { contains: needle, mode: "insensitive" } } } },
      ],
    },
    select: searchSelect,
  });

  const ranked = rows
    .map((row) => ({ row, score: rank(row, needle) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.row.popularity - a.row.popularity || a.row.id.localeCompare(b.row.id),
    );

  return {
    items: ranked.slice(0, limit).map(({ row: { id, title, posterUrl, releaseYear } }) => ({
      id,
      title,
      posterUrl,
      releaseYear,
    })),
    total: rows.length,
  };
}

export async function listMovies(genre: string | undefined, page: number, limit: number) {
  const where = genre ? { genres: { some: { slug: genre } } } : {};

  const [items, total] = await Promise.all([
    prisma.movie.findMany({
      where,
      select: movieSummarySelect,
      orderBy: [{ popularity: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.movie.count({ where }),
  ]);

  return { items, page, limit, total, hasMore: page * limit < total };
}

// The same page, with everything a detail view or an embedding needs. A separate function
// rather than a flag on the one above: a ternary select collapses both shapes into one union
// that cannot be narrowed afterwards, because the type is decided before the flag is read.
export async function listFullMovies(genre: string | undefined, page: number, limit: number) {
  const where = genre ? { genres: { some: { slug: genre } } } : {};

  const [rows, total] = await Promise.all([
    prisma.movie.findMany({
      where,
      select: fullMovieSelect,
      orderBy: [{ popularity: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.movie.count({ where }),
  ]);

  return { items: rows.map(toMovie), page, limit, total, hasMore: page * limit < total };
}

export async function getMovie(id: string): Promise<Movie | null> {
  const movie = await prisma.movie.findUnique({
    where: { id },
    select: fullMovieSelect,
  });

  if (!movie) {
    return null;
  }

  return toMovie(movie);
}
