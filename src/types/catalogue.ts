export type Genre = { id: string; name: string; slug: string };

export type Actor = { id: string; name: string; profileUrl: string | null };

export type MovieSummary = { id: string; title: string; posterUrl: string; releaseYear: number };

export type Movie = MovieSummary & {
  overview: string;
  backdropUrl: string | null;
  runtime: number | null;
  genres: Genre[];
  cast: Actor[];
};
