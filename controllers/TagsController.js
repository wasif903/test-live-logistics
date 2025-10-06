import mongoose from "mongoose";
import ContactModel from "../models/ContactSchema.js";
import TagModel from "../models/TagSchema.js";
import { normalizeFields } from "../utils/NormalizeString.js";
import RedisClient from "../utils/RedisClient.js";
import SearchQuery from "../utils/SearchQuery.js";
import AgencyModel from "../models/AgencySchema.js";
import ParcelModel from "../models/ParcelSchema.js";

// CREATE TAGS
// METHOD : POST
// ENDPOINT: /api/agencyID/create-tag/officeID
const HandleCreateTag = async (req, res, next) => {
  try {
    const { agencyID, officeID } = req.params;

    const { tagName } = normalizeFields(req.body, ["tagName"]);

    const existingTag = await TagModel.findOne({
      tagName,
      agencyID,
      officeID,
    });

    if (existingTag) {
      return res.status(409).json({
        message: `"${tagName} must be unique"`,
        contact: existingTag,
      });
    }

    const newTag = new TagModel({
      agencyID,
      officeID,
      tagName,
    });

    await newTag.save();

    await RedisClient.del("tags");

    res.status(201).json({
      message: "Tag created successfully",
      tags: newTag,
    });
  } catch (err) {
    next(err);
  }
};

// GET TAGS
// METHOD : GET
// ENDPOINT: api/get-tags?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetTags = async (req, res, next) => {
  try {
    const { agencyID, officeID } = req.params;

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
      {
        $unwind: "$agency",
      },
      {
        $lookup: {
          from: "offices",
          localField: "officeID",
          foreignField: "_id",
          as: "office",
        },
      },
      {
        $unwind: "$office",
      },
      {
        $lookup: {
          from: "parcels",
          localField: "_id",
          foreignField: "tagID",
          as: "parcelStatus",
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "parcelStatus._id",
          foreignField: "parcelID",
          as: "transactionStatus",
        },
      },
      {
        $project: {
          _id: 1,
          tagName: 1,
          parcelStatus: {
            $ifNull: [
              { $arrayElemAt: ["$parcelStatus.status", 0] },
              null
            ]
          },
          parcelPaymentStatus: {
            $ifNull: [
              { $arrayElemAt: ["$transactionStatus.paymentStatus", 0] },
              null
            ]
          },

          agency: {
            agencyID: "$agency._id",
            agencyName: "$agency.agencyName",
          },
          office: {
            officeID: "$office._id",
            officeName: "$office.officeName",
          },
        },
      },
    ];

    if (matchStage) pipeline.push(matchStage);
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const tags = await TagModel.aggregate(pipeline);

    const countPipeline = [{
      $match: {
        agencyID: new mongoose.Types.ObjectId(agencyID),
        officeID: new mongoose.Types.ObjectId(officeID),
      },
    }];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await TagModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      tags,
      meta: {
        totalItems,
        totalPages,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET ALL TAGS (ADMIN)
// METHOD : GET
// ENDPOINT: api/get-all-tags?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetAllTags = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    const pipeline = [
      {
        $lookup: {
          from: "agencies",
          localField: "agencyID",
          foreignField: "_id",
          as: "agency",
        },
      },
      {
        $unwind: "$agency",
      },
      {
        $lookup: {
          from: "offices",
          localField: "officeID",
          foreignField: "_id",
          as: "office",
        },
      },
      {
        $unwind: "$office",
      },
      {
        $lookup: {
          from: "parcels",
          localField: "_id",
          foreignField: "tagID",
          as: "parcelStatus",
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "parcelStatus._id",
          foreignField: "parcelID",
          as: "transactionStatus",
        },
      },
      {
        $project: {
          _id: 1,
          tagName: 1,
          parcelStatus: {
            $ifNull: [
              { $arrayElemAt: ["$parcelStatus.status", 0] },
              null
            ]
          },
          parcelPaymentStatus: {
            $ifNull: [
              { $arrayElemAt: ["$transactionStatus.paymentStatus", 0] },
              null
            ]
          },

          agency: {
            agencyID: "$agency._id",
            agencyName: "$agency.agencyName",
          },
          office: {
            officeID: "$office._id",
            officeName: "$office.officeName",
          },
        },
      }
    ];
    if (matchStage) pipeline.push(matchStage);
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const tags = await TagModel.aggregate(pipeline);

    const countPipeline = [];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await TagModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      tags,
      meta: {
        totalItems,
        totalPages,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET AGENCY TAGS (AGENCY)
// METHOD : GET
// ENDPOINT: api/get-agency-tags?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetAgencyTags = async (req, res, next) => {
  try {
    const { agencyID } = req.params;

    if (!agencyID) {
      return res.status(400).json({ message: "Bad Request" });
    }

    const findAgency = await AgencyModel.findById(agencyID);

    if (!findAgency) {
      return res.status(404).json({ message: "Agency Not Found" });
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
      {
        $unwind: "$agency",
      },
      {
        $lookup: {
          from: "offices",
          localField: "officeID",
          foreignField: "_id",
          as: "office",
        },
      },
      {
        $unwind: "$office",
      },
      {
        $lookup: {
          from: "parcels",
          localField: "_id",
          foreignField: "tagID",
          as: "parcelStatus",
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "parcelStatus._id",
          foreignField: "parcelID",
          as: "transactionStatus",
        },
      },
      {
        $project: {
          _id: 1,
          tagName: 1,
          parcelStatus: {
            $ifNull: [
              { $arrayElemAt: ["$parcelStatus.status", 0] },
              null
            ]
          },
          parcelPaymentStatus: {
            $ifNull: [
              { $arrayElemAt: ["$transactionStatus.paymentStatus", 0] },
              null
            ]
          },

          agency: {
            agencyID: "$agency._id",
            agencyName: "$agency.agencyName",
          },
          office: {
            officeID: "$office._id",
            officeName: "$office.officeName",
          },
        },
      },
    ];
    if (matchStage) pipeline.push(matchStage);
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const tags = await TagModel.aggregate(pipeline);

    const countPipeline = [{
      $match: {
        agencyID: new mongoose.Types.ObjectId(agencyID),
      },
    }];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await TagModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      tags,
      meta: {
        totalItems,
        totalPages,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET SINGLE TAGS 
// METHOD : GET
// ENDPOINT: api/get-single-tag/:tagID?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetSingleTag = async (req, res, next) => {
  try {

    const { tagID } = req.params;

    if (!tagID) {
      return res.status(404).json({ message: "Invalid Request" });
    }

    const findTag = await TagModel.findById(tagID);
    if (!findTag) {
      return res.status(404).json({ message: "Tag Not Found" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    const pipeline = [
      {
        $match: {
          tagID: new mongoose.Types.ObjectId(tagID),
        },
      },
    ];
    if (matchStage) pipeline.push(matchStage);
    // pipeline.push({
    //   $lookup: {
    //     from: "agencies",
    //     localField: "agencyID",
    //     foreignField: "_id",
    //     as: "agency",
    //   },
    // });
    // pipeline.push({
    //   $unwind: "$agency",
    // });
    pipeline.push({
      $lookup: {
        from: "offices",
        localField: "officeID",
        foreignField: "_id",
        as: "departure",
      },
    });
    pipeline.push({
      $unwind: "$departure",
    });
    pipeline.push({
      $lookup: {
        from: "offices",
        localField: "destinationID",
        foreignField: "_id",
        as: "destination",
      },
    });
    pipeline.push({
      $unwind: "$destination",
    });
    pipeline.push({
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "parcelID",
        as: "transaction",
      },
    });
    pipeline.push({
      $unwind: "$transaction",
    });
    pipeline.push({
      $project: {
        _id: 1,
        trackingID: 1,
        weight: 1,
        transportMethod: 1,
        status: 1,
        estimateArrival: 1,
        description: 1,
        mixedPackage: 1,
        whatsappNotif: 1,
        notificationCost: 1,
        packagePicture: 1,
        createdBy: 1,
        createdByType: 1,
        createdAt: 1,
        departure: {
          _id: "$departure._id",
          officeName: "$departure.officeName",
          phone: "$departure.phone",
          address: "$departure.address",
        },
        destination: {
          _id: "$destination._id",
          officeName: "$destination.officeName",
          phone: "$destination.phone",
          address: "$destination.address",
        },
        transaction: {
          _id: "$transaction._id",
          pricePerKilo: "$transaction.pricePerKilo",
          totalPrice: "$transaction.totalPrice",
          actualCarrierCost: "$transaction.actualCarrierCost",
          grossProfit: "$transaction.grossProfit",
          updatedBy: "$transaction.updatedBy",
          paymentStatus: "$transaction.paymentStatus",
        },
      },
    });

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const parcels = await ParcelModel.aggregate(pipeline);

    const countPipeline = [{
      $match: {
        tagID: new mongoose.Types.ObjectId(tagID),
      }
    }];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await ParcelModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      tag: findTag,
      parcels,
      meta: {
        totalItems,
        totalPages,
        page,
        limit,
      },
    });

  } catch (error) {
    next(error)
  }
}

export {
  HandleCreateTag,
  HandleGetTags,
  HandleGetAllTags,
  HandleGetAgencyTags,
  HandleGetSingleTag
};
