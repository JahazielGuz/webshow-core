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
