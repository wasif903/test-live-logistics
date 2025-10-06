import express from "express";
import { HandleGetAllUsers, HandleRegisterUser } from "../controllers/UserController.js";
import validate from "../middlewares/ValidationHandler.js";
import { userSchema } from "../validations/AuthValidations.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import AccessMiddleware from "../middlewares/AccessMiddleware.js";
import CacheMiddleware from "../middlewares/CacheMiddleware.js";

const router = express.Router();


router.post("/:agencyID/register-user/:officeID",
    AuthMiddleware,
    AccessMiddleware(['Admin', 'Agency', "Operator"]),
    validate(userSchema),
    HandleRegisterUser);


router.get(
    "/:agencyID/get-office-users/:officeID",
    AuthMiddleware,
    AccessMiddleware(["Admin", "Agency", "Operator"]),
    CacheMiddleware(
        'get-office-users',
        (req) => `${req.params.agencyID}_${req.params.officeID}`,
        120
    ),
    HandleGetAllUsers
);


export default router;

