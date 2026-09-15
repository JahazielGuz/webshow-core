import type { Request, Response } from "express";
import { z } from "zod";
import * as catalogueService from "../services/catalogueService.js";
import { HttpError } from "../lib/httpError.js";

const moviesQuery = z.object({
  genre: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
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
  const { genre, page, limit } = moviesQuery.parse(req.query);
  const result = await catalogueService.listMovies(genre, page, limit);
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
