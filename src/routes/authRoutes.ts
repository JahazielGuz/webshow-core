import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { requireUser } from "../middleware/requireUser.js";

export const authRoutes = Router();

authRoutes.post("/auth/register", authController.register);
authRoutes.post("/auth/login", authController.login);
authRoutes.post("/auth/refresh", authController.refresh);
authRoutes.post("/auth/logout", authController.logout);
authRoutes.get("/auth/me", requireUser, authController.me);

// Where other services look for the public key, so they can verify an access token without
// calling this service or sharing a secret with it
authRoutes.get("/.well-known/jwks.json", authController.jwks);
