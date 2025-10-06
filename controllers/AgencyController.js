import AdminModel from "../models/AdminSchema.js";
import AgencyModel from "../models/AgencySchema.js";
import UserModel from "../models/UserSchema.js";
import bcrypt from "bcrypt";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/TokenGenerator.js";
import { normalizeFields } from "../utils/NormalizeString.js";
import RedisClient from "../utils/RedisClient.js";
import SearchQuery from "../utils/SearchQuery.js";
import mongoose from "mongoose";
import autoMailer from "../utils/AutoMailer.js";

import invalidateCacheGroup from "../utils/RedisCache.js";

// REGISTER AGENCY
// METHOD : POST
// ENDPOINT: /api/agency/register-agency
const HandleRegisterAgency = async (req, res, next) => {
  try {
    const { username, agencyName, password } = req.body;

    const { email } = normalizeFields(req.body, ["email"]);

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

    const [lastAgency] = await AgencyModel.aggregate([
      {
        $sort: { companyCode: -1 },
      },
      {
        $limit: 1,
      },
      {
        $project: {
          companyCode: 1,
        },
      },
    ]);

    const newCompanyCode = lastAgency?.companyCode
      ? parseInt(lastAgency.companyCode) + 1
      : 1;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new AgencyModel({
      agencyName,
      username,
      email,
      password: hashedPassword,
      companyCode: newCompanyCode,
    });

    await newUser.save();

    await invalidateCacheGroup("get-all-agencies", "all");

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    newUser.refreshToken = refreshToken;
    await newUser.save();

    const userDetails = {
      username: newUser.username,
      agencyName: newUser.agencyName,
      companyCode: newUser.companyCode,
      email: newUser.email,
      role: newUser.role,
      _id: newUser._id,
      createdAt: newUser.createdAt,
    };

    autoMailer({
      from: "admin@tactix.asia",
      to: userDetails.email,
      subject: `Welcome to our platform, FLUXELIO`,
      message: `<h1 style="font-family: Arial, sans-serif; color: #2c3e50;">Welcome to our platform</h1>
            <br/>
            <h3 style="font-family: Arial, sans-serif; color: #34495e;">
               <strong>you have been registered as an Agency on our platform </strong>
               </br>
               <h4>${userDetails.agencyName} we wish you happy bussiness</h4>
            </h3>`,
    });

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

// UPDATE AGENCY
// METHOD : PATCH
// ENDPOINT: /api/agency/update-agency/:agencyID
const HandleUpdateAgency = async (req, res, next) => {
  try {
    const { agencyID } = req.params;
    const { agencyName, username, email } = req.body;

    const existingUser =
      (await AgencyModel.findOne({
        _id: { $ne: agencyID },
        $or: [{ username }, { email }],
      })) ||
      (await AdminModel.findOne({
        _id: { $ne: agencyID },
        $or: [{ username }, { email }],
      })) ||
      (await UserModel.findOne({
        _id: { $ne: agencyID },
        $or: [{ username }, { email }],
      }));

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already taken" });
    }

    const updatedAgency = await AgencyModel.findByIdAndUpdate(
      agencyID,
      { agencyName, username, email },
      { new: true }
    );

    if (!updatedAgency) {
      return res.status(404).json({ message: "Agency not found" });
    }

    await invalidateCacheGroup("get-all-agencies", "all");

    res.status(200).json({
      message: "Agency updated successfully",
      agency: updatedAgency,
    });
  } catch (err) {
    next(err);
  }
};

// GET ALL AGENCIES
// METHOD : GET
// ENDPOINT: /api/agency/get-all-agencies?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetAllAgencies = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    const pipeline = [];
    if (matchStage) pipeline.push(matchStage);
    pipeline.push({ $sort: { companyCode: -1 } });

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const agencies = await AgencyModel.aggregate(pipeline);

    const countPipeline = [];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await AgencyModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      agencies,
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

// SINGLE AGENCY
// METHOD : GET
// ENDPOINT: /api/agency/single-agency/:agencyID
const HandleGetSingleAgency = async (req, res, next) => {
  try {
    const { agencyID } = req.params;
    const agency = await AgencyModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(agencyID),
        },
      },
    ]);
    if (!agency.length) {
      return res.status(404).json({ message: "Invalid Agency ID" });
    }
    res.status(200).json({ agency });
  } catch (err) {
    next(err);
  }
};

// GET Offices By Agency
// METHOD : GET
// ENDPOINT: /api/agency/filter-office-by-agency?search[_id]=6850b1da042ed0aa67e0d663 (FILTER)
const HandleFilterOfficesByAgency = async (req, res, next) => {
  try {
    const search = req.query.search || {};
    
    if (search._id) {
      try {
        search._id = new mongoose.Types.ObjectId(search._id);
        console.log("Converted _id:", search._id);
      } catch (e) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
    }
    
    if (search.officeID) {
      try {
        search.officeID = new mongoose.Types.ObjectId(search.officeID);
      } catch (e) {
        return res.status(400).json({ message: "Invalid office ID format" });
      }
    }
    
    const matchStage = SearchQuery(search);
    console.log("Search object:", search);
    console.log("Match stage:", matchStage);

    const pipeline = [];
    if (matchStage) pipeline.push(matchStage);
    pipeline.push({
      $lookup: {
        from: "offices",
        localField: "_id",
        foreignField: "agencyID",
        as: "offices",
      },
    });
    pipeline.push({
      $project: {
        _id: 1,
        agencyName: 1,
        offices: {
          $map: {
            input: "$offices",
            as: "office",
            in: {
              officeID: "$$office._id",
              officeName: "$$office.officeName",
            },
          },
        },
      },
    });

    pipeline.push({ $sort: { createdAt: -1 } });

    const agencies = await AgencyModel.aggregate(pipeline);

    res.status(200).json({
      agencies,
    });
  } catch (err) {
    console.log(err, "--------");
    next(err);
  }
};

export {
  HandleRegisterAgency,
  HandleGetAllAgencies,
  HandleUpdateAgency,
  HandleGetSingleAgency,
  HandleFilterOfficesByAgency,
};
