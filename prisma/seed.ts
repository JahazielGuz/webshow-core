import { prisma } from "../src/lib/prisma.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const TMDB_MAX_PAGE = 500;

const LISTS = ["upcoming", "now_playing", "popular"];
const MAX_MOVIES = 1000;
const CANDIDATE_BUFFER = 50;
const CAST_LIMIT = 10;

const REQUESTS_PER_SECOND = 30;
const CONCURRENCY = 10;
const MAX_ATTEMPTS = 4;

const token = process.env.TMDB_READ_ACCESS_TOKEN;

if (!token) {
  throw new Error("TMDB_READ_ACCESS_TOKEN is not set");
}

type TmdbGenre = { id: number; name: string };

type TmdbListMovie = {
  id: number;
  title: string;
  adult: boolean;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
};

type TmdbListPage = {
  total_pages: number;
  results: TmdbListMovie[];
};

type TmdbCastMember = {
  id: number;
  name: string;
  profile_path: string | null;
  order: number;
};

type TmdbVideo = { site: string; type: string; key: string };

type TmdbMovie = {
  id: number;
  title: string;
  adult: boolean;
  overview: string;
  release_date: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  genres: TmdbGenre[];
  credits: { cast: TmdbCastMember[] };
  videos: { results: TmdbVideo[] };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createRateLimiter(requestsPerSecond: number) {
  const interval = 1000 / requestsPerSecond;
  let nextSlot = 0;

  return async function acquire() {
    const now = Date.now();
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + interval;

    if (slot > now) {
      await sleep(slot - now);
    }
  };
}

const acquire = createRateLimiter(REQUESTS_PER_SECOND);

async function tmdbRequest<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(TMDB_BASE + path);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  for (let attempt = 1; ; attempt++) {
    await acquire();

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    const retryable = res.status === 429 || res.status >= 500;

    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(`TMDB ${res.status} ${res.statusText} on ${path}`);
    }

    const waitSeconds = Number(res.headers.get("retry-after")) || 2 ** attempt;
    console.warn(`${res.status} on ${path}, retry ${attempt} in ${waitSeconds}s`);
    await sleep(waitSeconds * 1000);
  }
}

function isDisplayable(movie: TmdbListMovie): boolean {
  return Boolean(
    !movie.adult &&
    movie.title &&
    movie.overview &&
    movie.poster_path &&
    movie.backdrop_path &&
    movie.release_date &&
    movie.genre_ids.length > 0,
  );
}

async function collectMovieIds(): Promise<number[]> {
  const ids = new Set<number>();
  const target = MAX_MOVIES + CANDIDATE_BUFFER;

  for (const list of LISTS) {
    let page = 1;
    let totalPages = 1;

    while (ids.size < target && page <= Math.min(totalPages, TMDB_MAX_PAGE)) {
      const data = await tmdbRequest<TmdbListPage>(`/movie/${list}`, {
        page,
        region: "US",
        language: "en-US",
      });
      totalPages = data.total_pages;

      for (const movie of data.results) {
        if (ids.size < target && isDisplayable(movie)) {
          ids.add(movie.id);
        }
      }

      page++;
    }

    console.log(`${list}: ${ids.size} movies collected so far`);
  }

  return [...ids];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function fetchMovies(ids: number[]): Promise<TmdbMovie[]> {
  console.log(`fetching details for ${ids.length} movies...`);

  const movies = await mapWithConcurrency(ids, CONCURRENCY, (id) =>
    tmdbRequest<TmdbMovie>(`/movie/${id}`, {
      append_to_response: "credits,videos",
      language: "en-US",
    }),
  );

  const complete = movies.filter((movie) => movie.runtime && movie.credits.cast.length > 0);

  return complete.slice(0, MAX_MOVIES);
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function writeCatalogue(genres: TmdbGenre[], movies: TmdbMovie[]) {
  const genreIds = new Map<number, string>();

  for (const genre of genres) {
    const row = await prisma.genre.create({
      data: { name: genre.name, slug: slugify(genre.name) },
    });
    genreIds.set(genre.id, row.id);
  }

  const actorIds = new Map<number, string>();

  for (const movie of movies) {
    const actors: { id: string }[] = [];

    for (const member of movie.credits.cast.slice(0, CAST_LIMIT)) {
      let id = actorIds.get(member.id);

      if (!id) {
        const row = await prisma.actor.create({
          data: {
            name: member.name,
            profileUrl: member.profile_path ? `${IMAGE_BASE}/w185${member.profile_path}` : null,
          },
        });
        id = row.id;
        actorIds.set(member.id, id);
      }

      actors.push({ id });
    }

    const videos = movie.videos.results.filter((video) => video.site === "YouTube");
    const trailer =
      videos.find((video) => video.type === "Trailer") ??
      videos.find((video) => video.type === "Teaser");

    await prisma.movie.create({
      data: {
        title: movie.title,
        overview: movie.overview,
        releaseYear: Number(movie.release_date.slice(0, 4)),
        runtime: movie.runtime,
        posterUrl: `${IMAGE_BASE}/w500${movie.poster_path}`,
        backdropUrl: `${IMAGE_BASE}/w1280${movie.backdrop_path}`,
        trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
        popularity: movie.popularity,
        genres: { connect: movie.genres.map((genre) => ({ id: genreIds.get(genre.id)! })) },
        actors: { connect: actors },
      },
    });
  }
}

try {
  const { genres } = await tmdbRequest<{ genres: TmdbGenre[] }>("/genre/movie/list", {
    language: "en-US",
  });
  const ids = await collectMovieIds();
  const movies = await fetchMovies(ids);
  await writeCatalogue(genres, movies);

  console.log(`seeded ${movies.length} movies`);
} finally {
  await prisma.$disconnect();
}
