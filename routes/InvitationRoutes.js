import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import { InvitationSchema } from "../validations/InvitaionValidations.js";
import { HandleGetInvitations, HandleSendBulkInvitations } from "../controllers/InvitationController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";

const router = express.Router();

router.post(
  "/:agencyID/send-invitations/:officeID",
  AuthMiddleware,
  AccessMiddleware(["Admin", "Agency"]),
  validate(InvitationSchema),
  HandleSendBulkInvitations
);

router.get(
  "/:adminID/get-invitations",
  AuthMiddleware,
  AccessMiddleware(["Admin"]),
  HandleGetInvitations
);

export default router;
