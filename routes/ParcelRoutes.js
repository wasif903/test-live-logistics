import express from "express";
import validate from "../middlewares/ValidationHandler.js";

import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import CacheMiddleware from "../middlewares/CacheMiddleware.js";
import { parcelSchema, updateParcelSchema } from "../validations/ParcelValidations.js";

import {
  HandleCreateParcel,
  HandleGetAgencyParcels,
  HandleGetParcels,
  HandleGetSingleParcel,
  HandleUpdateParcelStatus,
  HandleBulkUpdateParcelStatus,
  HandleParcelReqFilters,
  HandleTrackParcel,
  HandleGetTransaction,
  HandleGetOfficeParcels,
} from "../controllers/ParcelController.js";
import { CreateUploadMiddleware } from "../middlewares/MulterMiddleware.js";

const router = express.Router();

router.post(
  "/:agencyID/create-parcel/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  CreateUploadMiddleware([{ name: "packagePicture", isMultiple: true }]),
  validate(parcelSchema),
  HandleCreateParcel
);

router.patch(
  "/:agencyID/:officeID/:parcelID/:updatedBy/update-parcel-status",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  CreateUploadMiddleware([{ name: "packagePicture", isMultiple: true }]),
  validate(updateParcelSchema),
  HandleUpdateParcelStatus
);

router.patch(
  "/:agencyID/:officeID/:tagID/:updatedBy/bulk-update-parcel-status",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  CreateUploadMiddleware([{ name: "packagePicture", isMultiple: true }]),
  validate(updateParcelSchema),
  HandleBulkUpdateParcelStatus
);

router.get(
  "/get-parcels",
  // AuthMiddleware,
  // AccessMiddleware(["Admin"]),
  // CacheMiddleware("get-parcels", (req) => "all"),
  HandleGetParcels
);

router.get("/track-parcels/:trackingID", HandleTrackParcel);

router.get(
  "/:agencyID/get-agency-parcels",
  AuthMiddleware,
  AccessMiddleware(["Agency"]),
  CacheMiddleware("get-agency-parcels", (req) => req.params.agencyID, 120),
  HandleGetAgencyParcels
);

router.get(
  "/:agencyID/get-office-parcels/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  CacheMiddleware(
    "get-office-parcels",
    (req) => `${req.params.agencyID}:${req.params.officeID}`,
    120
  ),
  HandleGetOfficeParcels
);

router.get(
  "/:parcelID/get-single-parcels",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  HandleGetSingleParcel
);



router.get("/get-transactions",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  HandleGetTransaction
)

router.get("/track-parcel/:trackingID",
  CacheMiddleware(
    "track-parcel",
    (req) => `${req.params.trackingID}`,
    120
  ),
  HandleTrackParcel
)


router.get(
  "/filters-required-parcel",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency", "Operator"]),
  HandleParcelReqFilters
);

export default router;
