import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import { tagSchema } from "../validations/TagsValidations.js";
import {
  HandleCreateTag,
  HandleGetAgencyTags,
  HandleGetAllTags,
  HandleGetSingleTag,
  HandleGetTags,
} from "../controllers/TagsController.js";

const router = express.Router();

router.post(
  "/:agencyID/create-tag/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  validate(tagSchema),
  HandleCreateTag
);

router.get(
  "/:agencyID/get-tags/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  HandleGetTags
);

router.get(
  "/get-all-tags",
  AuthMiddleware,
  AccessMiddleware(["Admin"]),
  HandleGetAllTags
);

router.get(
  "/:agencyID/get-agency-tags",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  HandleGetAgencyTags
);


router.get("/get-single-tag/:tagID", HandleGetSingleTag)

export default router;
