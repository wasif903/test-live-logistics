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
import invalidateCacheGroup from "../utils/RedisCache.js";
import OperatorModel from "../models/OperatorSchema.js";

// REGISTER USER
// METHOD : POST
// ENDPOINT: /api/user/:agencyID/register-user/:officeID
const HandleRegisterUser = async (req, res, next) => {
    try {

        const { agencyID, officeID } = req.params;

        const { username, phone, password, createdBy } = req.body;

        const { email, countryCode, country } = normalizeFields(req.body, ["email", "countryCode", "country"]);

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
            }));

        if (existingUser) {
            return res
                .status(400)
                .json({ message: "Username or email already taken" });
        }


        const userCreatedBy = (await AdminModel.findById(createdBy)) ||
            (await AgencyModel.findById(createdBy)) || (await OperatorModel.findById(createdBy))

        if (!userCreatedBy) {
            return res
                .status(400)
                .json({ message: "Invalid Created By ID" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new UserModel({
            agencyID,
            officeID,
            createdBy,
            username,
            email,
            country,
            countryCode,
            phone,
            password: hashedPassword,
        });

        await newUser.save();

        const accessToken = generateAccessToken(newUser);
        const refreshToken = generateRefreshToken(newUser);

        newUser.refreshToken = refreshToken;
        await newUser.save();

        invalidateCacheGroup("get-office-users", `${agencyID}_${officeID}`)

        const userDetails = {
            username: newUser.username,
            email: newUser.email,
            country: newUser.country,
            countryCode: newUser.countryCode,
            phone: newUser.phone,
            role: newUser.role,
            agencyID: newUser.agencyID,
            officeID: newUser.officeID,
            createdBy: newUser.createdBy,
            _id: newUser._id,
        };

        // Return tokens
        res.status(201).json({
            message: "User registered successfully",
            accessToken,
            refreshToken,
            user: userDetails,
        });
    } catch (err) {
        next(err);
    }
};


// GET ALL USERS
// METHOD : GET
// ENDPOINT: /api/user/:agencyID/get-agency-users/officeID?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetAllUsers = async (req, res, next) => {
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
                    country: 1,
                    countryCode: 1,
                    phone: 1,
                    email: 1,
                    createdBy: 1,
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

        const users = await UserModel.aggregate(pipeline);

        const countPipeline = [{
            $match: {
                agencyID: new mongoose.Types.ObjectId(agencyID),
                officeID: new mongoose.Types.ObjectId(officeID),
            },
        },];
        if (matchStage) countPipeline.push(matchStage);
        countPipeline.push({ $count: "totalItems" });

        const countResult = await UserModel.aggregate(countPipeline);
        const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({
            users,
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


export { HandleRegisterUser, HandleGetAllUsers }