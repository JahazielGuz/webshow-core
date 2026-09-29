import { Router } from "express";
import * as watchController from "../controllers/watchController.js";
import { requireUser } from "../middleware/requireUser.js";

export const watchRoutes = Router();

// Every route here is about one person's viewing, so none of them exist without a token
watchRoutes.put("/watch-progress/:movieId", requireUser, watchController.record);
watchRoutes.get("/watch-progress", requireUser, watchController.listProgress);
watchRoutes.get("/watch-progress/:movieId", requireUser, watchController.resumePoint);
