import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { publicJwks } from "../lib/tokens.js";
import * as authService from "../services/authService.js";

const credentials = z.object({
  email: z.email().max(254),
  // Long enough to be worth hashing, capped so nobody can post a megabyte to burn our CPU
  password: z.string().min(8).max(200),
});

const registration = credentials.extend({
  displayName: z.string().trim().min(1).max(60),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

export async function register(req: Request, res: Response) {
  const { email, password, displayName } = registration.parse(req.body);
  const result = await authService.register(email, password, displayName);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentials.parse(req.body);
  const result = await authService.login(email, password);
  res.json(result);
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshBody.parse(req.body);
  const tokens = await authService.refresh(refreshToken);
  res.json(tokens);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = refreshBody.parse(req.body);
  await authService.logout(refreshToken);
  res.status(204).end();
}

export async function me(_req: Request, res: Response) {
  const user = await authService.findUser(res.locals.userId);

  // The token verified but its user is gone, so the token is worthless
  if (user === null) {
    throw new HttpError(401, "UNAUTHENTICATED", "Please sign in again");
  }

  res.json({ user });
}

export async function jwks(_req: Request, res: Response) {
  const keys = await publicJwks();
  res.json(keys);
}
