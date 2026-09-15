import { Router } from "express";
import * as catalogueController from "../controllers/catalogueController.js";

export const catalogueRoutes = Router();

catalogueRoutes.get("/genres", catalogueController.listGenres);
catalogueRoutes.get("/browse", catalogueController.browse);
catalogueRoutes.get("/movies", catalogueController.listMovies);
catalogueRoutes.get("/movies/:id", catalogueController.getMovie);
