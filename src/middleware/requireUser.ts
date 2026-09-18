import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import { verifyAccessToken } from "../lib/tokens.js";

function unauthenticated() {
  return new HttpError(401, "UNAUTHENTICATED", "This endpoint needs a valid access token");
}

// Puts the caller's user id in res.locals.userId, or refuses the request. Every reason to
// refuse looks the same from outside: a missing header tells an attacker as little as an
// expired token does.
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");

  if (scheme !== "Bearer" || !token) {
    next(unauthenticated());
    return;
  }

  try {
    const userId = await verifyAccessToken(token);
    res.locals.userId = userId;
    next();
  } catch {
    next(unauthenticated());
  }
}
