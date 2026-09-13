import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../lib/httpError.js";

export function notFound(req: Request, res: Response, next: NextFunction) {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
}
