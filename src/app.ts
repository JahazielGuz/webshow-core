import express from "express";
import { authRoutes } from "./routes/authRoutes.js";
import { catalogueRoutes } from "./routes/catalogueRoutes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // custom routes
  app.use(authRoutes);
  app.use(catalogueRoutes);

  // error code middleware
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
