import express from "express";
import validate from "../middlewares/ValidationHandler.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import { HandleCreateSupport, HandleGetSingleTicket, HandleGetSupport, HandleUpdateTicketStatus } from "../controllers/SupportController.js";
import { SupportSchema } from "../validations/SupportValidations.js";
import { CreateUploadMiddleware } from "../middlewares/MulterMiddleware.js";


const router = express.Router();


router.post("/submit-ticket/:createdBy",
    AuthMiddleware,
    AccessMiddleware(["Admin", "Agency", "Operator"]),
    CreateUploadMiddleware([{ name: "images", isMultiple: true }]),
    validate(SupportSchema),
    HandleCreateSupport)


router.get(
    "/:adminID/get-tickets",
    AuthMiddleware,
    AccessMiddleware(["Admin"]),
    HandleGetSupport
);


router.get(
    "/:adminID/get-single-ticket/:ticketID",
    AuthMiddleware,
    AccessMiddleware(["Admin"]),
    HandleGetSingleTicket
);

router.patch(
    "/:adminID/update-ticket-status/:ticketID",
    AuthMiddleware,
    AccessMiddleware(["Admin"]),
    HandleUpdateTicketStatus
);



export default router;
