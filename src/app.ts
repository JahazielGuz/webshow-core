import express from "express";
import { catalogueRoutes } from "./routes/catalogueRoutes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  const dog = {
    pita: {
      yo: 3,
      hg: 3,
      jj: 5,
      cj: 6,
      pj: 7,
      dfidofiod: "diofdif",
      dksfjdkfjkdfjdjf: "dfdkfjdkfdofido",
    },
  };

  // custom routes
  app.use(catalogueRoutes);

  // error code middleware
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
