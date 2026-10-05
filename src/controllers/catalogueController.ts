import type { Request, Response } from "express";
import { z } from "zod";
import * as catalogueService from "../services/catalogueService.js";
import { HttpError } from "../lib/httpError.js";

const moviesQuery = z
  .object({
    genre: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    view: z.enum(["summary", "full"]).default("summary"),
    // A comma-separated list rather than repeated parameters: 100 uuids is about 3.7 KB of URL,
    // inside what every proxy allows, and it keeps this a cacheable GET
    ids: z
      .string()
      .transform((value) => value.split(",").map((id) => id.trim()))
      .pipe(z.array(z.uuid()).min(1).max(100))
      .optional(),
  })
  // `ids` names exactly which films to return, so paging and filtering it would be two
  // contradictory instructions. Refusing beats silently ignoring one of them.
  .refine((query) => query.ids === undefined || query.genre === undefined, {
    message: "ids cannot be combined with genre",
  });

const searchQuery = z.object({
  // The box is never submitted empty, so an empty q is a caller bug rather than "everything"
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().positive().max(50).default(24),
});

const movieParams = z.object({
  id: z.uuid(),
});

export async function listGenres(_req: Request, res: Response) {
  const items = await catalogueService.listGenres();
  res.json({ items });
}

export async function browse(_req: Request, res: Response) {
  const rows = await catalogueService.browse();
  res.json({ rows });
}

export async function listMovies(req: Request, res: Response) {
  const { genre, page, limit, view, ids } = moviesQuery.parse(req.query);

  if (ids !== undefined) {
    const result = await catalogueService.moviesByIds(ids, view);
    res.json(result);
    return;
  }

  const result =
    view === "full"
      ? await catalogueService.listFullMovies(genre, page, limit)
      : await catalogueService.listMovies(genre, page, limit);

  res.json(result);
}

export async function search(req: Request, res: Response) {
  const { q, limit } = searchQuery.parse(req.query);
  const result = await catalogueService.searchMovies(q, limit);

  res.json(result);
}

export async function getMovie(req: Request, res: Response) {
  const { id } = movieParams.parse(req.params);
  const movie = await catalogueService.getMovie(id);

  if (!movie) {
    throw new HttpError(404, "NOT_FOUND", "Movie not found");
  }

  res.json(movie);
}
