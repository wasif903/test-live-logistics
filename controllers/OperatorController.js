import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import {
    generateAccessToken,
    generateRefreshToken,
} from "../utils/TokenGenerator.js";
import AdminModel from "../models/AdminSchema.js";
import OfficeModel from "../models/OfficeSchema.js";
import UserModel from "../models/UserSchema.js";
import AgencyModel from "../models/AgencySchema.js";
import { normalizeFields } from "../utils/NormalizeString.js";
import mongoose from "mongoose";
import SearchQuery from "../utils/SearchQuery.js";
import OperatorModel from "../models/OperatorSchema.js";
import InvitationModel from "../models/InvitationSchema.js";
import invalidateCacheGroup from "../utils/RedisCache.js";

// REGISTER USER
// METHOD : POST
// ENDPOINT: /api/operator/:agencyID/register-operator/:officeID?token=<invitation-token>
const HandleRegisterOperator = async (req, res, next) => {
    try {
        const { token } = req.params;

        const invite = await InvitationModel.findOne({ token });

        if (!invite || invite.used || invite.expiresAt < new Date()) {
            return res.status(400).json({ message: "Invalid or expired invitation." });
        }

        const agencyID = invite.agencyID;
        const officeID = invite.officeID;

        const email = invite.email;

        const { username, phone, password } = req.body;

        const findAgency = await AgencyModel.findById(agencyID);
        if (!findAgency) {
            return res
                .status(400)
                .json({ message: "Invalid Agency ID Provided" });
        }

        const findOffice = await OfficeModel.findById(officeID);
        if (!findOffice) {
            return res
                .status(400)
                .json({ message: "Invalid Agency ID Provided" });
        }

        const existingUser =
            (await AdminModel.findOne({
                $or: [{ username }, { email }],
            })) ||
            (await UserModel.findOne({
                $or: [{ username }, { email }],
            })) ||
            (await AgencyModel.findOne({
                $or: [{ username }, { email }],
            })) ||
            (await OperatorModel.findOne({
                $or: [{ username }, { email }],
            }));

        if (existingUser) {
            return res
                .status(400)
                .json({ message: "Username or email already taken" });
        }


        const hashedPassword = await bcrypt.hash(password, 10);

        const newOperator = new OperatorModel({
            agencyID,
            officeID,
            username,
            email,
            phone,
            password: hashedPassword,
        });

        await newOperator.save();

        const accessToken = generateAccessToken(newOperator);
        const refreshToken = generateRefreshToken(newOperator);

        newOperator.refreshToken = refreshToken;
        await newOperator.save();

        invite.used = true;
        await invite.save();

        await invalidateCacheGroup("get-all-operators", `${agencyID}_${officeID}`);


        const userDetails = {
            username: newOperator.username,
            email: newOperator.email,
            phone: newOperator.phone,
            role: newOperator.role,
            agencyID: newOperator.agencyID,
            officeID: newOperator.officeID,
            createdBy: newOperator.createdBy,
            _id: newOperator._id,
        };

        // Return tokens
        res.status(201).json({
            message: "Operator registered successfully",
            accessToken,
            refreshToken,
            user: userDetails,
        });
    } catch (err) {
        next(err);
    }
};


// GET ALL OPERATORS
// METHOD : GET
// ENDPOINT: /api/operator/:agencyID/get-agency-users/officeID?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetAllOperators = async (req, res, next) => {
    try {

        const { agencyID, officeID } = req.params;

        if (!agencyID) {
            return res.status(400).json({ message: "Bad Request" })
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const search = req.query.search || {};
        const matchStage = SearchQuery(search);

        const pipeline = [
            {
                $match: {
                    agencyID: new mongoose.Types.ObjectId(agencyID),
                    officeID: new mongoose.Types.ObjectId(officeID),
                },
            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "agencyID",
                    foreignField: "_id",
                    as: "agency",
                },
            },
            { $unwind: "$agency" },
            {
                $lookup: {
                    from: "offices",
                    localField: "officeID",
                    foreignField: "_id",
                    as: "office",
                },
            },
            { $unwind: "$office" },
            {
                $project: {
                    // spread all fields from the original document
                    _id: 1,
                    agencyID: 1,
                    officeID: 1,
                    username: 1,
                    phone: 1,
                    email: 1,
                    role: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    __v: 1,
                    agencyName: "$agency.agencyName",
                    officeName: "$office.officeName",
                },
            },
        ];

        if (matchStage) pipeline.push(matchStage);
        pipeline.push({ $sort: { companyCode: -1 } });

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const operators = await OperatorModel.aggregate(pipeline);

        const countPipeline = [{
            $match: {
                agencyID: new mongoose.Types.ObjectId(agencyID),
                officeID: new mongoose.Types.ObjectId(officeID),
            },
        },];
        if (matchStage) countPipeline.push(matchStage);
        countPipeline.push({ $count: "totalItems" });

        const countResult = await OperatorModel.aggregate(countPipeline);
        const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({
            operators,
            meta: {
                totalItems,
                totalPages,
                page,
                limit,
            },
        });
    } catch (err) {
        console.log(err, "--------");
        next(err);
    }
};


export {
    HandleRegisterOperator,
    HandleGetAllOperators
}