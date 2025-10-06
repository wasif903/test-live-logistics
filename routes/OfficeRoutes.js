import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import CacheMiddleware from "../middlewares/CacheMiddleware.js";
import { officeSchema } from "../validations/OfficeValidations.js";
import { HandleCreateOffice, HandleGetAllOffices, HandleGetSingleOffice, HandleUpdateOffice } from "../controllers/OfficeController.js";

const router = express.Router();

router.post(
  "/create-office",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  validate(officeSchema),
  HandleCreateOffice
);

router.patch(
  "/:agencyID/update-office/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  HandleUpdateOffice
);

router.get(
  "/:agencyID/get-all-offices",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  CacheMiddleware('get-all-offices', (req) => req.params.agencyID, 120),
  HandleGetAllOffices
);

router.get(
  "/:agencyID/single-office/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  HandleGetSingleOffice
);

export default router;
