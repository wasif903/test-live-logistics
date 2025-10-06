import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import { InvitationSchema } from "../validations/InvitaionValidations.js";
import { HandleSendBulkInvitations } from "../controllers/InvitationController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import { HandleGetAllOperators, HandleRegisterOperator } from "../controllers/OperatorController.js";
import { operatorSchema } from "../validations/OperatorValidations.js";
import CacheMiddleware from "../middlewares/CacheMiddleware.js";

const router = express.Router();

router.post(
    "/register-operator/:token",
    validate(operatorSchema),
    HandleRegisterOperator
);

router.get(
    "/:agencyID/get-all-operators/:officeID",
    AuthMiddleware,
    AccessMiddleware(["Admin", "Agency"]),
    CacheMiddleware('get-all-operators', (req) => `${req.params.agencyID}_${req.params.officeID}`, 120),
    HandleGetAllOperators
);

export default router;
