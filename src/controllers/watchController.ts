import type { Request, Response } from "express";
import { z } from "zod";
import * as watchService from "../services/watchService.js";

const movieParams = z.object({
  movieId: z.uuid(),
});

const progressQuery = z.object({
  status: z.enum(["in-progress", "completed"]).default("in-progress"),
});

const progressBody = z.object({
  // Whole seconds: sub-second accuracy buys nothing and invites floating point drift in a bar
  positionSeconds: z.coerce.number().int().nonnegative().max(86_400),
  durationSeconds: z.coerce.number().int().positive().max(86_400),
});

export async function record(req: Request, res: Response) {
  const { movieId } = movieParams.parse(req.params);
  const { positionSeconds, durationSeconds } = progressBody.parse(req.body);

  await watchService.record(res.locals.userId, movieId, positionSeconds, durationSeconds);

  // The player reports constantly and never reads the answer, so there is nothing to send back
  res.status(204).end();
}

export async function listProgress(req: Request, res: Response) {
  const { status } = progressQuery.parse(req.query);
  const items = await watchService.listProgress(res.locals.userId, status);
  res.json({ items });
}

export async function resumePoint(req: Request, res: Response) {
  const { movieId } = movieParams.parse(req.params);
  const point = await watchService.resumePoint(res.locals.userId, movieId);
  res.json(point);
}
