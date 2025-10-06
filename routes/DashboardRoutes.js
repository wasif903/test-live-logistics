import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import { contactSchema } from "../validations/ContactValidations.js";
import {
  HandleCreateContact,
  HandleGetQueries,
} from "../controllers/ContactController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import CacheMiddleware from "../middlewares/CacheMiddleware.js";
import { HandleGetDashboardData } from "../controllers/DashboardController.js";

const router = express.Router();


router.get(
  "/dashboard",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  CacheMiddleware("dashboard", (req) => req.query.id, 120),
  HandleGetDashboardData
);

export default router;
