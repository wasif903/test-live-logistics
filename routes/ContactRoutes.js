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

const router = express.Router();

router.post("/post-query", validate(contactSchema), HandleCreateContact);

router.get(
  "/get-queries",
  AuthMiddleware,
  AccessMiddleware(["Admin"]),
  CacheMiddleware("contacts", () => "all", 120),
  HandleGetQueries
);

export default router;
