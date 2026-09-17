import { prisma } from "../lib/prisma.js";
import type { Genre, Movie, MovieSummary } from "../types/catalogue.js";

const genreSelect = { id: true, name: true, slug: true };
const movieSummarySelect = { id: true, title: true, posterUrl: true, releaseYear: true };

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

export async function getMovie(id: string): Promise<Movie | null> {
  const movie = await prisma.movie.findUnique({
    where: { id },
    select: {
      ...movieSummarySelect,
      overview: true,
      backdropUrl: true,
      runtime: true,
      trailerUrl: true,
      genres: { select: genreSelect, orderBy: { name: "asc" } },
      actors: { select: { id: true, name: true, profileUrl: true }, orderBy: { name: "asc" } },
    },
  });

  if (!movie) {
    return null;
  }

  const { actors, ...rest } = movie;
  return { ...rest, cast: actors };
}
