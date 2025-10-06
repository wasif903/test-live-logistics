import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import CacheMiddleware from "../middlewares/CacheMiddleware.js";
import {
  agencySchema,
  updateAgencySchema,
} from "../validations/AgencyValidations.js";
import {
  HandleFilterOfficesByAgency,
  HandleGetAllAgencies,
  HandleGetSingleAgency,
  HandleRegisterAgency,
  HandleUpdateAgency,
} from "../controllers/AgencyController.js";

const router = express.Router();

router.post("/register-agency", validate(agencySchema), HandleRegisterAgency);

router.patch(
  "/update-agency/:agencyID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  validate(updateAgencySchema),
  HandleUpdateAgency
);

router.get(
  "/get-all-agencies",
  AuthMiddleware,
  AccessMiddleware(["Admin"]),
  CacheMiddleware("get-all-agencies", (req) => "all"),
  HandleGetAllAgencies
);

router.get(
  "/single-agency/:agencyID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  HandleGetSingleAgency
);


router.get(
  "/filter-office-by-agency",
  AuthMiddleware,
  AccessMiddleware(["Admin"]),
  HandleFilterOfficesByAgency
);

export default router;
