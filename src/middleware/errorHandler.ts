import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError.js";

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message }});
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ")
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message }});
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong"}});
}
