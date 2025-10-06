import AgencyModel from "../models/AgencySchema.js";
import OfficeModel from "../models/OfficeSchema.js";
import ParcelModel from "../models/ParcelSchema.js";
import { GenerateTrackingID } from "../utils/GenerateTrackingID.js";
import { normalizeFields } from "../utils/NormalizeString.js";
import RedisClient from "../utils/RedisClient.js";
import SearchQuery from "../utils/SearchQuery.js";
import ExtractRelativeFilePath from "../middlewares/ExtractRelativePath.js";
import UserModel from "../models/UserSchema.js";
import TransactionModel from "../models/TransactionSchema.js";
import TrackingModel from "../models/TrackingSchema.js";
import {
  getParcelStatusMessage,
  getTransactionStatusMessage,
} from "../utils/TrackingStatus.js";
import TransactionTrackingModel from "../models/TransactionTrackingSchema.js";
import TagModel from "../models/TagSchema.js";
import AdminModel from "../models/AdminSchema.js";
import OperatorModel from "../models/OperatorSchema.js";
import mongoose from "mongoose";
import invalidateCacheGroup from "../utils/RedisCache.js";
import { validateParcelStatusByPayment } from "../utils/ParcelStatusValidation.js";

// CREATE PARCEL
// METHOD : POST
// ENDPOINT: /api/parcel/:agencyID/create-parcel/:officeID
const HandleCreateParcel = async (req, res, next) => {
  const session = await ParcelModel.startSession();
  session.startTransaction();
  try {
    const { agencyID, officeID } = req.params;

    const findAgency = await AgencyModel.findById(agencyID).session(session);
    if (!findAgency) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Agency not found",
      });
    }

    const findOffice = await OfficeModel.findOne({
      _id: officeID,
      agencyID: findAgency._id,
    }).session(session);
    if (!findOffice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Office not found",
      });
    }

    const {
      weight,
      customerID,
      transportMethod,
      destinationID,
      tagID,
      estimateArrival,
      description,
      mixedPackage,
      whatsappNotif,
      pricePerKilo,
      actualCarrierCost,
      paymentStatus,
      status,
      createdBy,
      partialAmount,
    } = req.body;

    const notificationCost = req.body.notificationCost;

    let totalPrice = parseInt(weight) * parseInt(pricePerKilo);
    if (notificationCost !== null && notificationCost > 0) {
      totalPrice += parseInt(notificationCost);
    }

    const packagePictures =
      req.files?.packagePicture?.map((file) => ExtractRelativeFilePath(file)) ||
      [];

    const findCreatedBy =
      (await AdminModel.findOne({
        _id: createdBy,
      }).session(session)) ||
      (await AgencyModel.findOne({
        _id: createdBy,
      }).session(session)) ||
      (await OperatorModel.findOne({
        officeID: officeID,
        agencyID: agencyID,
        _id: createdBy,
      }).session(session));

    if (!findCreatedBy) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Created By ID is Invalid",
      });
    }

    const findCustomer = await UserModel.findById(customerID).session(session);
    if (!findCustomer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Customer Not Found",
      });
    }

    const destinationOffice = await OfficeModel.findById(destinationID).session(
      session
    );
    if (!destinationOffice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Destination office not found",
      });
    }

    let getTagID;
    if (tagID && tagID !== null && tagID !== "null") {
      const findTag = await TagModel.findOne({
        agencyID: agencyID,
        officeID: officeID,
        _id: tagID,
      }).session(session);
      if (!findTag) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Invalid Tag ID" });
      }
      getTagID = findTag._id;

      // Validate that existing parcels with the same tagID have the same status and paymentStatus
      const existingParcels = await ParcelModel.find({
        tagID: getTagID,
      }).session(session);

      if (existingParcels.length > 0) {
        // Get the first parcel's status and paymentStatus as reference
        const firstParcel = existingParcels[0];
        const referenceStatus = firstParcel.status;
        const referencePaymentStatus = await TransactionModel.findOne({
          parcelID: firstParcel._id,
        }).session(session).then(tx => tx?.paymentStatus);

        // Check if all existing parcels have the same status
        const statusMismatch = existingParcels.some(parcel => parcel.status !== referenceStatus);
        if (statusMismatch) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `All parcels with tag ${findTag.tagName} must have the same status. Expected: ${referenceStatus}, but found different statuses.`
          });
        }

        // Check if all existing parcels have the same paymentStatus
        for (const parcel of existingParcels) {
          const transaction = await TransactionModel.findOne({
            parcelID: parcel._id,
          }).session(session);

          if (transaction?.paymentStatus !== referencePaymentStatus) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              message: `All parcels with tag ${findTag.tagName} must have the same payment status. Expected: ${referencePaymentStatus}, but found: ${transaction?.paymentStatus}`
            });
          }
        }

        // Validate that the new parcel has the same status and paymentStatus
        if (status !== referenceStatus) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Parcel status must match existing parcels with tag ${findTag.tagName}. Expected: ${referenceStatus}, provided: ${status}`
          });
        }

        if (paymentStatus !== referencePaymentStatus) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Payment status must match existing parcels with tag ${findTag.tagName}. Expected: ${referencePaymentStatus}, provided: ${paymentStatus}`
          });
        }
      }

    } else {
      getTagID = null;
    }

    const generateTrackingID = await GenerateTrackingID(
      findAgency.companyCode,
      destinationOffice.address.country,
      session
    );

    const grossProfit = totalPrice - actualCarrierCost;

    if (paymentStatus === "PARTIALLY PAID") {
      if (!partialAmount || partialAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            "Partial amount is required and must be greater than 0 when payment status is PARTIALLY PAID",
        });
      }
      if (partialAmount >= totalPrice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `Partial amount must be less than total price (${totalPrice})`,
        });
      }
    }

    // Validate parcel status based on payment status
    const statusValidation = validateParcelStatusByPayment(
      status,
      paymentStatus
    );
    if (!statusValidation.isValid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: statusValidation.errorMessage,
      });
    }

    const createParcel = new ParcelModel({
      trackingID: generateTrackingID,
      agencyID: agencyID,
      officeID: officeID,
      customerID: customerID,
      weight: weight,
      transportMethod: transportMethod,
      status: status,
      departureID: officeID,
      createdBy: findCreatedBy._id,
      createdByType: findCreatedBy.role[0],
      destinationID: destinationID,
      estimateArrival: estimateArrival,
      description: description,
      mixedPackage: mixedPackage,
      whatsappNotif: whatsappNotif,
      notificationCost: notificationCost,
      tagID: getTagID,
      packagePicture: packagePictures,
    });
    await createParcel.save({ session });

    const generateTransaction = new TransactionModel({
      parcelID: createParcel._id,
      agencyID,
      officeID,
      pricePerKilo: pricePerKilo,
      totalPrice: totalPrice,
      partialAmount: partialAmount,
      actualCarrierCost: actualCarrierCost,
      grossProfit: grossProfit,
      updatedBy: createdBy,
      updatedByType: findCreatedBy.role[0],
      paymentStatus: paymentStatus,
    });
    await generateTransaction.save({ session });

    const trackParcel = new TrackingModel({
      parcelID: createParcel._id,
      trackingID: generateTrackingID,
      status: status,
      message: getParcelStatusMessage(status),
      updatedBy: createdBy,
      updatedByType: findCreatedBy.role[0],
    });
    await trackParcel.save({ session });

    const trackTransaction = new TransactionTrackingModel({
      transactionID: generateTransaction._id,
      status: paymentStatus,
      message: getTransactionStatusMessage(paymentStatus),
      updatedBy: createdBy,
      updatedByType: findCreatedBy.role[0],
    });
    await trackTransaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    await invalidateCacheGroup("get-parcels", "all");
    await invalidateCacheGroup("get-agency-parcels", agencyID);
    await invalidateCacheGroup("get-office-parcels", `${agencyID}:${officeID}`);

    res.status(201).json({
      message: "Parcel created successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// GET PARCEL (Admin)
// METHOD : GET
// ENDPOINT: /api/parcel/get-parcels
const HandleGetParcels = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    const pipeline = [];
    if (matchStage) pipeline.push(matchStage);
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
      $lookup: {
        from: "tags",
        localField: "tagID",
        foreignField: "_id",
        as: "tagDetails",
      },
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
        tagID: 1,
        tag: {
          $cond: [
            { $eq: ["$tagID", null] },
            null,
            { $arrayElemAt: ["$tagDetails", 0] },
          ],
        },
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

    const countPipeline = [];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await ParcelModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      parcels,
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

// GET PARCEL (Agency)
// METHOD : GET
// ENDPOINT: /api/parcel/:agencyID/get-agency-parcels
const HandleGetAgencyParcels = async (req, res, next) => {
  try {
    const { agencyID } = req.params;

    if (!agencyID) {
      return res.status(404).json({ message: "Invalid Request" });
    }

    const findAgency = await AgencyModel.findById(agencyID);

    if (!findAgency) {
      return res.status(404).json({ message: "Invalid Request" });
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
      $lookup: {
        from: "tags",
        localField: "tagID",
        foreignField: "_id",
        as: "tagDetails",
      },
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
        tagID: 1,
        tag: {
          $cond: [
            { $eq: ["$tagID", null] },
            null,
            { $arrayElemAt: ["$tagDetails", 0] },
          ],
        },
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
        agencyID: new mongoose.Types.ObjectId(agencyID),
      }
    }];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await ParcelModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      parcels,
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

// GET PARCEL (Office / Operators)
// METHOD : GET
// ENDPOINT: /api/parcel/:agencyID/get-office-parcels/:officeID
const HandleGetOfficeParcels = async (req, res, next) => {
  try {
    const { agencyID, officeID } = req.params;

    if (!agencyID || !officeID) {
      return res.status(404).json({ message: "Invalid Request" });
    }

    const findAgency = await AgencyModel.findById(agencyID);
    if (!findAgency) {
      return res.status(404).json({ message: "Invalid Request" });
    }

    const findOffice = await OfficeModel.findById(officeID);
    if (!findOffice) {
      return res.status(404).json({ message: "Invalid Request" });
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
      $lookup: {
        from: "tags",
        localField: "tagID",
        foreignField: "_id",
        as: "tagDetails",
      },
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
        tagID: 1,
        tag: {
          $cond: [
            { $eq: ["$tagID", null] },
            null,
            { $arrayElemAt: ["$tagDetails", 0] },
          ],
        },
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
        agencyID: new mongoose.Types.ObjectId(agencyID),
        officeID: new mongoose.Types.ObjectId(officeID),
      },
    }];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await ParcelModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      parcels,
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

// GET SINGLE PARCEL
// METHOD : GET
// ENDPOINT: /api/parcel/:parcelID/get-single-parcels
const HandleGetSingleParcel = async (req, res, next) => {
  try {
    const { parcelID } = req.params;

    const findParcel = await ParcelModel.findById(parcelID);
    if (!findParcel) {
      return res.status(404).json({ message: "Invalid Parcel ID" });
    }

    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(parcelID) } },
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
          from: "users",
          localField: "customerID",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "offices",
          localField: "officeID",
          foreignField: "_id",
          as: "departure",
        },
      },
      { $unwind: "$departure" },
      {
        $lookup: {
          from: "offices",
          localField: "destinationID",
          foreignField: "_id",
          as: "destination",
        },
      },
      { $unwind: "$destination" },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "parcelID",
          as: "transaction",
        },
      },
      { $unwind: "$transaction" },
      {
        $lookup: {
          from: "tags",
          localField: "tagID",
          foreignField: "_id",
          as: "tagDetails",
        },
      },
    
      // -----------------------------
      // Step 1: Lookup parcel_trackings with updatedBy info
      // -----------------------------
      {
        $lookup: {
          from: "parcel_trackings",
          localField: "_id",
          foreignField: "parcelID",
          as: "parcel_trackings",
        },
      },
      { $unwind: { path: "$parcel_trackings", preserveNullAndEmptyArrays: true } },
    
      // Lookup updatedBy info for parcel_trackings
      {
        $lookup: {
          from: "admins",
          let: { updatedBy: "$parcel_trackings.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Admin" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            { $project: { _id: 1, username: 1, type: { $literal: "Admin" } } },
          ],
          as: "trackingUpdatedByAdmin",
        },
      },
      {
        $lookup: {
          from: "agencies",
          let: { updatedBy: "$parcel_trackings.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Agency" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$agencyName",
                type: { $literal: "Agency" },
              },
            },
          ],
          as: "trackingUpdatedByAgency",
        },
      },
      {
        $lookup: {
          from: "operators",
          let: { updatedBy: "$parcel_trackings.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Operator" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$username",
                type: { $literal: "Operator" },
              },
            },
          ],
          as: "trackingUpdatedByOperator",
        },
      },
      {
        $addFields: {
          "parcel_trackings.trackingUpdatedBy": {
            $cond: [
              { $gt: [{ $size: "$trackingUpdatedByAdmin" }, 0] },
              { $arrayElemAt: ["$trackingUpdatedByAdmin", 0] },
              {
                $cond: [
                  { $gt: [{ $size: "$trackingUpdatedByAgency" }, 0] },
                  { $arrayElemAt: ["$trackingUpdatedByAgency", 0] },
                  {
                    $cond: [
                      { $gt: [{ $size: "$trackingUpdatedByOperator" }, 0] },
                      { $arrayElemAt: ["$trackingUpdatedByOperator", 0] },
                      null,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    
      // Group back after parcel_trackings
      {
        $group: {
          _id: "$_id",
          trackingID: { $first: "$trackingID" },
          weight: { $first: "$weight" },
          transportMethod: { $first: "$transportMethod" },
          status: { $first: "$status" },
          estimateArrival: { $first: "$estimateArrival" },
          description: { $first: "$description" },
          mixedPackage: { $first: "$mixedPackage" },
          whatsappNotif: { $first: "$whatsappNotif" },
          notificationCost: { $first: "$notificationCost" },
          tagID: { $first: "$tagID" },
          tagDetails: { $first: "$tagDetails" },
          packagePicture: { $first: "$packagePicture" },
          createdBy: { $first: "$createdBy" },
          createdAt: { $first: "$createdAt" },
          agency: { $first: "$agency" },
          customer: { $first: "$customer" },
          departure: { $first: "$departure" },
          destination: { $first: "$destination" },
          transaction: { $first: "$transaction" },
          parcel_trackings: {
            $push: "$parcel_trackings",
          },
        },
      },
    
      // Lookup transaction_trackings separately
      {
        $lookup: {
          from: "transaction_trackings",
          localField: "transaction._id",
          foreignField: "transactionID",
          as: "transaction_tracking",
        },
      },
      { $unwind: { path: "$transaction_tracking", preserveNullAndEmptyArrays: true } },
    
      // updatedBy lookups for transaction_tracking
      {
        $lookup: {
          from: "admins",
          let: { updatedBy: "$transaction_tracking.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Admin" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            { $project: { _id: 1, username: 1, type: { $literal: "Admin" } } },
          ],
          as: "updatedByInfoAdmin",
        },
      },
      {
        $lookup: {
          from: "agencies",
          let: { updatedBy: "$transaction_tracking.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Agency" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$agencyName",
                type: { $literal: "Agency" },
              },
            },
          ],
          as: "updatedByInfoAgency",
        },
      },
      {
        $lookup: {
          from: "operators",
          let: { updatedBy: "$transaction_tracking.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Operator" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$username",
                type: { $literal: "Operator" },
              },
            },
          ],
          as: "updatedByInfoOperator",
        },
      },
      {
        $addFields: {
          "transaction_tracking.updatedByInfo": {
            $cond: [
              { $gt: [{ $size: "$updatedByInfoAdmin" }, 0] },
              { $arrayElemAt: ["$updatedByInfoAdmin", 0] },
              {
                $cond: [
                  { $gt: [{ $size: "$updatedByInfoAgency" }, 0] },
                  { $arrayElemAt: ["$updatedByInfoAgency", 0] },
                  {
                    $cond: [
                      { $gt: [{ $size: "$updatedByInfoOperator" }, 0] },
                      { $arrayElemAt: ["$updatedByInfoOperator", 0] },
                      null,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    
      // Group transaction_trackings back
      {
        $group: {
          _id: "$_id",
          trackingID: { $first: "$trackingID" },
          weight: { $first: "$weight" },
          transportMethod: { $first: "$transportMethod" },
          status: { $first: "$status" },
          estimateArrival: { $first: "$estimateArrival" },
          description: { $first: "$description" },
          mixedPackage: { $first: "$mixedPackage" },
          whatsappNotif: { $first: "$whatsappNotif" },
          notificationCost: { $first: "$notificationCost" },
          tagID: { $first: "$tagID" },
          tagDetails: { $first: "$tagDetails" },
          packagePicture: { $first: "$packagePicture" },
          createdBy: { $first: "$createdBy" },
          createdAt: { $first: "$createdAt" },
          agency: { $first: "$agency" },
          customer: { $first: "$customer" },
          departure: { $first: "$departure" },
          destination: { $first: "$destination" },
          transaction: { $first: "$transaction" },
          parcel_trackings: { $first: "$parcel_trackings" },
          transaction_tracking: {
            $push: "$transaction_tracking",
          },
        },
      },
    
      // Optional: lookups for createdByInfo here...
    
      {
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
          tagID: 1,
          tag: {
            $cond: [
              { $eq: ["$tagID", null] },
              null,
              { $arrayElemAt: ["$tagDetails", 0] },
            ],
          },
          packagePicture: 1,
          createdAt: 1,
          agency: {
            _id: "$agency._id",
            agencyName: "$agency.agencyName",
            companyCode: "$agency.companyCode",
            username: "$agency.username",
          },
          customer: {
            _id: "$customer._id",
            username: "$customer.username",
            country: "$customer.country",
            countryCode: "$customer.countryCode",
            phone: "$customer.phone",
            email: "$customer.email",
          },
          departure: {
            _id: "$departure._id",
            agencyID: "$departure.agencyID",
            officeName: "$departure.officeName",
            phone: "$departure.phone",
            address: "$departure.address",
          },
          destination: {
            _id: "$destination._id",
            agencyID: "$destination.agencyID",
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
            paymentStatus: "$transaction.paymentStatus",
          },
          parcel_trackings: 1,
          transaction_tracking: 1,
        },
      },
    ];

    const parcel = await ParcelModel.aggregate(pipeline);

    res.status(200).json({
      parcel: parcel[0],
    });
  } catch (err) {
    next(err);
  }
};


// GET TRACK PARCEL
// METHOD : GET
// ENDPOINT: /api/parcel/track-parcel/1-UK-250704-002
const HandleTrackParcel = async (req, res, next) => {
  try {
    const { trackingID } = req.params;

    const findParcel = await ParcelModel.findOne({ trackingID: trackingID });
    if (!findParcel) {
      return res.status(404).json({ message: "Invalid Parcel ID" });
    }

    const pipeline = [
      { $match: { trackingID: trackingID } },
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
          from: "users",
          localField: "customerID",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "offices",
          localField: "officeID",
          foreignField: "_id",
          as: "departure",
        },
      },
      { $unwind: "$departure" },
      {
        $lookup: {
          from: "offices",
          localField: "destinationID",
          foreignField: "_id",
          as: "destination",
        },
      },
      { $unwind: "$destination" },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "parcelID",
          as: "transaction",
        },
      },
      { $unwind: "$transaction" },
      {
        $lookup: {
          from: "tags",
          localField: "tagID",
          foreignField: "_id",
          as: "tagDetails",
        },
      },
    
      // -----------------------------
      // Step 1: Lookup parcel_trackings with updatedBy info
      // -----------------------------
      {
        $lookup: {
          from: "parcel_trackings",
          localField: "_id",
          foreignField: "parcelID",
          as: "parcel_trackings",
        },
      },
      { $unwind: { path: "$parcel_trackings", preserveNullAndEmptyArrays: true } },
    
      // Lookup updatedBy info for parcel_trackings
      {
        $lookup: {
          from: "admins",
          let: { updatedBy: "$parcel_trackings.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Admin" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            { $project: { _id: 1, username: 1, type: { $literal: "Admin" } } },
          ],
          as: "trackingUpdatedByAdmin",
        },
      },
      {
        $lookup: {
          from: "agencies",
          let: { updatedBy: "$parcel_trackings.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Agency" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$agencyName",
                type: { $literal: "Agency" },
              },
            },
          ],
          as: "trackingUpdatedByAgency",
        },
      },
      {
        $lookup: {
          from: "operators",
          let: { updatedBy: "$parcel_trackings.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Operator" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$username",
                type: { $literal: "Operator" },
              },
            },
          ],
          as: "trackingUpdatedByOperator",
        },
      },
      {
        $addFields: {
          "parcel_trackings.trackingUpdatedBy": {
            $cond: [
              { $gt: [{ $size: "$trackingUpdatedByAdmin" }, 0] },
              { $arrayElemAt: ["$trackingUpdatedByAdmin", 0] },
              {
                $cond: [
                  { $gt: [{ $size: "$trackingUpdatedByAgency" }, 0] },
                  { $arrayElemAt: ["$trackingUpdatedByAgency", 0] },
                  {
                    $cond: [
                      { $gt: [{ $size: "$trackingUpdatedByOperator" }, 0] },
                      { $arrayElemAt: ["$trackingUpdatedByOperator", 0] },
                      null,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    
      // Group back after parcel_trackings
      {
        $group: {
          _id: "$_id",
          trackingID: { $first: "$trackingID" },
          weight: { $first: "$weight" },
          transportMethod: { $first: "$transportMethod" },
          status: { $first: "$status" },
          estimateArrival: { $first: "$estimateArrival" },
          description: { $first: "$description" },
          mixedPackage: { $first: "$mixedPackage" },
          whatsappNotif: { $first: "$whatsappNotif" },
          notificationCost: { $first: "$notificationCost" },
          tagID: { $first: "$tagID" },
          tagDetails: { $first: "$tagDetails" },
          packagePicture: { $first: "$packagePicture" },
          createdBy: { $first: "$createdBy" },
          createdAt: { $first: "$createdAt" },
          agency: { $first: "$agency" },
          customer: { $first: "$customer" },
          departure: { $first: "$departure" },
          destination: { $first: "$destination" },
          transaction: { $first: "$transaction" },
          parcel_trackings: {
            $push: "$parcel_trackings",
          },
        },
      },
    
      // Lookup transaction_trackings separately
      {
        $lookup: {
          from: "transaction_trackings",
          localField: "transaction._id",
          foreignField: "transactionID",
          as: "transaction_tracking",
        },
      },
      { $unwind: { path: "$transaction_tracking", preserveNullAndEmptyArrays: true } },
    
      // updatedBy lookups for transaction_tracking
      {
        $lookup: {
          from: "admins",
          let: { updatedBy: "$transaction_tracking.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Admin" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            { $project: { _id: 1, username: 1, type: { $literal: "Admin" } } },
          ],
          as: "updatedByInfoAdmin",
        },
      },
      {
        $lookup: {
          from: "agencies",
          let: { updatedBy: "$transaction_tracking.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Agency" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$agencyName",
                type: { $literal: "Agency" },
              },
            },
          ],
          as: "updatedByInfoAgency",
        },
      },
      {
        $lookup: {
          from: "operators",
          let: { updatedBy: "$transaction_tracking.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $literal: "Operator" }, "$role"] },
                    { $eq: ["$_id", "$$updatedBy"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                username: "$username",
                type: { $literal: "Operator" },
              },
            },
          ],
          as: "updatedByInfoOperator",
        },
      },
      {
        $addFields: {
          "transaction_tracking.updatedByInfo": {
            $cond: [
              { $gt: [{ $size: "$updatedByInfoAdmin" }, 0] },
              { $arrayElemAt: ["$updatedByInfoAdmin", 0] },
              {
                $cond: [
                  { $gt: [{ $size: "$updatedByInfoAgency" }, 0] },
                  { $arrayElemAt: ["$updatedByInfoAgency", 0] },
                  {
                    $cond: [
                      { $gt: [{ $size: "$updatedByInfoOperator" }, 0] },
                      { $arrayElemAt: ["$updatedByInfoOperator", 0] },
                      null,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    
      // Group transaction_trackings back
      {
        $group: {
          _id: "$_id",
          trackingID: { $first: "$trackingID" },
          weight: { $first: "$weight" },
          transportMethod: { $first: "$transportMethod" },
          status: { $first: "$status" },
          estimateArrival: { $first: "$estimateArrival" },
          description: { $first: "$description" },
          mixedPackage: { $first: "$mixedPackage" },
          whatsappNotif: { $first: "$whatsappNotif" },
          notificationCost: { $first: "$notificationCost" },
          tagID: { $first: "$tagID" },
          tagDetails: { $first: "$tagDetails" },
          packagePicture: { $first: "$packagePicture" },
          createdBy: { $first: "$createdBy" },
          createdAt: { $first: "$createdAt" },
          agency: { $first: "$agency" },
          customer: { $first: "$customer" },
          departure: { $first: "$departure" },
          destination: { $first: "$destination" },
          transaction: { $first: "$transaction" },
          parcel_trackings: { $first: "$parcel_trackings" },
          transaction_tracking: {
            $push: "$transaction_tracking",
          },
        },
      },
    
      // Optional: lookups for createdByInfo here...
    
      {
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
          tagID: 1,
          tag: {
            $cond: [
              { $eq: ["$tagID", null] },
              null,
              { $arrayElemAt: ["$tagDetails", 0] },
            ],
          },
          packagePicture: 1,
          createdAt: 1,
          agency: {
            _id: "$agency._id",
            agencyName: "$agency.agencyName",
            companyCode: "$agency.companyCode",
            username: "$agency.username",
          },
          customer: {
            _id: "$customer._id",
            username: "$customer.username",
            country: "$customer.country",
            countryCode: "$customer.countryCode",
            phone: "$customer.phone",
            email: "$customer.email",
          },
          departure: {
            _id: "$departure._id",
            agencyID: "$departure.agencyID",
            officeName: "$departure.officeName",
            phone: "$departure.phone",
            address: "$departure.address",
          },
          destination: {
            _id: "$destination._id",
            agencyID: "$destination.agencyID",
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
            paymentStatus: "$transaction.paymentStatus",
          },
          parcel_trackings: 1,
          transaction_tracking: 1,
        },
      },
    ];
    

    const parcel = await ParcelModel.aggregate(pipeline);

    res.status(200).json({
      parcel: parcel[0],
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE SINGLE PARCEL
// METHOD : GET
// ENDPOINT: /api/parcel/:agencyID/:officeID/:parcelID/:updatedBy/update-parcel-status
const HandleUpdateParcelStatus = async (req, res, next) => {
  const session = await ParcelModel.startSession();
  session.startTransaction();
  try {
    const { agencyID, officeID, parcelID, updatedBy } = req.params;
    const { status, paymentStatus } = req.body;
    // Convert string "null" to actual null for partialAmount
    const partialAmount = req.body.partialAmount === "null" ? null : req.body.partialAmount;

    // Validate agency
    const findAgency = await AgencyModel.findById(agencyID).session(session);
    if (!findAgency) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Agency Not Found" });
    }

    // Validate office
    const findOffice = await OfficeModel.findOne({
      _id: officeID,
      agencyID: agencyID,
    }).session(session);
    if (!findOffice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Office Not Found" });
    }

    // Find parcel
    const findParcel = await ParcelModel.findOne({
      _id: parcelID,
      agencyID: agencyID,
      officeID: officeID,
    }).session(session);
    if (!findParcel) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Parcel Not Found" });
    }

    if (findParcel.tagID !== null) {
      return res
        .status(400)
        .json({ message: "Tag Parcels Cannot Be Updated Individually" });
    }

    // Find transaction to get current payment status
    const findTransaction = await TransactionModel.findOne({
      parcelID: parcelID,
    }).session(session);

    if (!findTransaction) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Transaction not found for this parcel" });
    }

    let updatedPackagePictures = findParcel.packagePicture;

    if (
      req.files &&
      req.files.packagePicture &&
      req.files.packagePicture.length > 0
    ) {
      const newPictures = req.files.packagePicture.map((file) =>
        ExtractRelativeFilePath(file)
      );
      updatedPackagePictures = [...findParcel.packagePicture, ...newPictures];
    }

    // Validate who is updating
    const findUpdatedBy =
      (await AdminModel.findOne({
        _id: updatedBy,
      }).session(session)) ||
      (await AgencyModel.findOne({
        _id: updatedBy,
      }).session(session)) ||
      (await OperatorModel.findOne({
        officeID: officeID,
        agencyID: agencyID,
        _id: updatedBy,
      }).session(session));

    if (!findUpdatedBy) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Updated By ID is Invalid",
      });
    }

    // Validate parcel status based on payment status
    const statusValidation = validateParcelStatusByPayment(
      status,
      paymentStatus
    );
    if (!statusValidation.isValid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: statusValidation.errorMessage,
      });
    }

    // Validate partial amount if payment status is PARTIALLY PAID
    if (paymentStatus === "PARTIALLY PAID") {
      if (!partialAmount || partialAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            "Partial amount is required and must be greater than 0 when payment status is PARTIALLY PAID",
        });
      }
      if (partialAmount >= findTransaction.totalPrice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `Partial amount must be less than total price (${findTransaction.totalPrice})`,
        });
      }
    }

    // Update parcel status
    findParcel.status = status;
    findParcel.packagePicture = updatedPackagePictures;
    await findParcel.save({ session });

    // Update transaction payment status and partial amount
    findTransaction.paymentStatus = paymentStatus;
    if (paymentStatus === "PARTIALLY PAID") {
      findTransaction.partialAmount = partialAmount;
    } else {
      findTransaction.partialAmount = null;
    }
    findTransaction.updatedBy = updatedBy;
    findTransaction.updatedByType = findUpdatedBy.role[0];
    await findTransaction.save({ session });

    // Create parcel tracking record
    const trackParcel = new TrackingModel({
      parcelID: findParcel._id,
      trackingID: findParcel.trackingID,
      status: status,
      message: getParcelStatusMessage(status),
      updatedBy: updatedBy,
      updatedByType: findUpdatedBy.role[0],
    });
    await trackParcel.save({ session });

    // Create transaction tracking record
    const trackTransaction = new TransactionTrackingModel({
      transactionID: findTransaction._id,
      status: paymentStatus,
      message: getTransactionStatusMessage(paymentStatus),
      updatedBy: updatedBy,
      updatedByType: findUpdatedBy.role[0],
    });
    await trackTransaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Invalidate cache
    await invalidateCacheGroup("get-parcels", "all");
    await invalidateCacheGroup("get-agency-parcels", agencyID);
    await invalidateCacheGroup("get-office-parcels", `${agencyID}:${officeID}`);
    await invalidateCacheGroup("parcel", parcelID);

    res.status(200).json({
      message: "Parcel status updated successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// UPDATE TAG PARCEL
// METHOD : PATCH
// ENDPOINT: /api/parcel/:agencyID/:officeID/:tagID/:updatedBy/bulk-update-parcel-status
const HandleBulkUpdateParcelStatus = async (req, res, next) => {
  const session = await ParcelModel.startSession();
  session.startTransaction();
  try {
    const { agencyID, officeID, tagID, updatedBy } = req.params;
    const { status, paymentStatus, partialAmount } = req.body;

    const findAgency = await AgencyModel.findById(agencyID).session(session);
    if (!findAgency) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Agency Not Found" });
    }

    const findOffice = await OfficeModel.findOne({
      _id: officeID,
      agencyID: agencyID,
    }).session(session);
    if (!findOffice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Office Not Found" });
    }

    const findTag = await TagModel.findOne({
      _id: tagID,
      agencyID: agencyID,
      officeID: officeID,
    }).session(session);
    if (!findTag) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Tag Not Found" });
    }

    const findParcels = await ParcelModel.find({
      tagID: tagID,
      agencyID: agencyID,
      officeID: officeID,
    }).session(session);

    if (findParcels.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "No Parcels Found In This Tag" });
    }

    const findUpdatedBy =
      (await AdminModel.findOne({
        _id: updatedBy,
      }).session(session)) ||
      (await AgencyModel.findOne({
        _id: updatedBy,
      }).session(session)) ||
      (await OperatorModel.findOne({
        officeID: officeID,
        agencyID: agencyID,
        _id: updatedBy,
      }).session(session));

    if (!findUpdatedBy) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Updated By ID is Invalid",
      });
    }

    const statusValidation = validateParcelStatusByPayment(
      status,
      paymentStatus
    );
    if (!statusValidation.isValid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: statusValidation.errorMessage,
      });
    }

    const updatedParcels = [];
    const updatedTransactions = [];

    for (const parcel of findParcels) {
      const findTransaction = await TransactionModel.findOne({
        parcelID: parcel._id,
      }).session(session);

      if (!findTransaction) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          message: `Transaction not found for parcel ${parcel.trackingID}`,
        });
      }

      if (paymentStatus === "PARTIALLY PAID") {
        if (!partialAmount || partialAmount <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Partial amount is required and must be greater than 0 for parcel ${parcel.trackingID}`,
          });
        }
        if (partialAmount >= findTransaction.totalPrice) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Partial amount must be less than total price (${findTransaction.totalPrice}) for parcel ${parcel.trackingID}`,
          });
        }
      }

      let updatedPackagePictures = parcel.packagePicture;
      if (
        req.files &&
        req.files.packagePicture &&
        req.files.packagePicture.length > 0
      ) {
        const newPictures = req.files.packagePicture.map((file) =>
          ExtractRelativeFilePath(file)
        );
        updatedPackagePictures = [...parcel.packagePicture, ...newPictures];
      }

      parcel.status = status;
      parcel.packagePicture = updatedPackagePictures;
      await parcel.save({ session });

      findTransaction.paymentStatus = paymentStatus;
      if (paymentStatus === "PARTIALLY PAID") {
        findTransaction.partialAmount = partialAmount;
      } else {
        findTransaction.partialAmount = null;
      }
      findTransaction.updatedBy = updatedBy;
      findTransaction.updatedByType = findUpdatedBy.role[0];
      await findTransaction.save({ session });

      // Create parcel tracking record
      const trackParcel = new TrackingModel({
        parcelID: parcel._id,
        trackingID: parcel.trackingID,
        status: status,
        message: getParcelStatusMessage(status),
        updatedBy: updatedBy,
        updatedByType: findUpdatedBy.role[0],
      });
      await trackParcel.save({ session });

      const trackTransaction = new TransactionTrackingModel({
        transactionID: findTransaction._id,
        status: paymentStatus,
        message: getTransactionStatusMessage(paymentStatus),
        updatedBy: updatedBy,
        updatedByType: findUpdatedBy.role[0],
      });
      await trackTransaction.save({ session });

      updatedParcels.push({
        _id: parcel._id,
        trackingID: parcel.trackingID,
        status: parcel.status,
        updatedAt: parcel.updatedAt,
      });

      updatedTransactions.push({
        _id: findTransaction._id,
        paymentStatus: findTransaction.paymentStatus,
        partialAmount: findTransaction.partialAmount,
        updatedAt: findTransaction.updatedAt,
      });
    }

    await session.commitTransaction();
    session.endSession();

    // Invalidate cache
    try {
      await invalidateCacheGroup("get-parcels", "all");
      await invalidateCacheGroup("get-agency-parcels", agencyID);
      await invalidateCacheGroup(
        "get-office-parcels",
        `${agencyID}:${officeID}`
      );
      // Invalidate cache for each updated parcel
      for (const parcel of updatedParcels) {
        await invalidateCacheGroup("parcel", parcel._id.toString());
      }
    } catch (cacheError) {
      console.error("Cache invalidation error:", cacheError);
    }

    res.status(200).json({
      message: `Successfully updated ${updatedParcels.length} parcels with tag ${findTag.tagName}`,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// GET FILTERS FOR PARCEL CREATION
// METHOD : GET
// ENDPOINT: /api/parcel/filters-required-parcel?search[_id]=6850b1da042ed0aa67e0d663 (FILTER)
const HandleParcelReqFilters = async (req, res, next) => {
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
        let: { agencyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$agencyID", "$$agencyId"] },
            },
          },
          {
            $lookup: {
              from: "users",
              let: { officeId: "$_id" },
              pipeline: [
                {
                  $project: { _id: 1, username: 1 },
                },
              ],
              as: "customers",
            },
          },
          {
            $project: {
              officeName: 1,
              customers: 1,
            },
          },
        ],
        as: "offices",
      },
    });
    pipeline.push({
      $project: {
        _id: 1,
        agencyName: 1,
        offices: 1,
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


// GET TRANSACTION
// METHOD : GET
// ENDPOINT: /api/parcel/get-transactions
const HandleGetTransaction = async (req, res, next) => {
  try {

    const { id } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || {};


    if (!id) {
      return res.status(400).json({ message: "Invalid Query Parameters" })
    }

    const findRole = (await AdminModel.findById(id)) || (await AgencyModel.findById(id)) || (await OperatorModel.findById(id));


    if (!findRole) {
      return res.status(404).json({ message: "Invalid Id provided" })
    }

    const matchStage = SearchQuery(search);

    const pipeline = [];
    if (matchStage) pipeline.push(matchStage);

    if (findRole.role.includes("Admin")) {

      pipeline.push({
        $lookup: {
          from: "parcels",
          localField: "parcelID",
          foreignField: "_id",
          as: "parcelDetails"
        }
      })
      pipeline.push({
        $unwind: "$parcelDetails",
      });
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "parcelDetails.customerID",
          foreignField: "_id",
          as: "customerDetails"
        }
      })
      pipeline.push({
        $unwind: "$customerDetails",
      });
      pipeline.push({
        $lookup: {
          from: "admins",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByAdmin"
        }
      });
      pipeline.push({
        $lookup: {
          from: "agencies",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByAgency"
        }
      });
      pipeline.push({
        $lookup: {
          from: "operators",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByOperator"
        }
      });
      pipeline.push({
        $project: {
          _id: 1,
          parcelID: 1,
          agencyID: 1,
          officeID: 1,
          pricePerKilo: 1,
          totalPrice: 1,
          actualCarrierCost: 1,
          grossProfit: 1,
          updatedBy: 1,
          updatedByType: 1,
          updatedByUsername: {
            $cond: [
              { $eq: ["$updatedByType", "Admin"] },
              { $arrayElemAt: ["$updatedByAdmin.username", 0] },
              {
                $cond: [
                  { $eq: ["$updatedByType", "Agency"] },
                  { $arrayElemAt: ["$updatedByAgency.agencyName", 0] },
                  { $arrayElemAt: ["$updatedByOperator.username", 0] }
                ]
              }
            ]
          },
          partialAmount: 1,
          paymentStatus: 1,
          trackingID: "$parcelDetails.trackingID",
          status: "$parcelDetails.status",
          customer: "$customerDetails.username",
        }
      })

      pipeline.push({ $sort: { createdAt: -1 } });
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });

    } else if (findRole.role.includes("Agency")) {

      pipeline.push({
        $match: {
          agencyID: new mongoose.Types.ObjectId(id)
        }
      })

      pipeline.push({
        $lookup: {
          from: "parcels",
          localField: "parcelID",
          foreignField: "_id",
          as: "parcelDetails"
        }
      })
      pipeline.push({
        $unwind: "$parcelDetails",
      });
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "parcelDetails.customerID",
          foreignField: "_id",
          as: "customerDetails"
        }
      })
      pipeline.push({
        $unwind: "$customerDetails",
      });
      pipeline.push({
        $lookup: {
          from: "admins",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByAdmin"
        }
      });
      pipeline.push({
        $lookup: {
          from: "agencies",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByAgency"
        }
      });
      pipeline.push({
        $lookup: {
          from: "operators",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByOperator"
        }
      });
      pipeline.push({
        $project: {
          _id: 1,
          parcelID: 1,
          agencyID: 1,
          officeID: 1,
          pricePerKilo: 1,
          totalPrice: 1,
          actualCarrierCost: 1,
          grossProfit: 1,
          updatedBy: 1,
          updatedByType: 1,
          updatedByUsername: {
            $cond: [
              { $eq: ["$updatedByType", "Admin"] },
              { $arrayElemAt: ["$updatedByAdmin.username", 0] },
              {
                $cond: [
                  { $eq: ["$updatedByType", "Agency"] },
                  { $arrayElemAt: ["$updatedByAgency.agencyName", 0] },
                  { $arrayElemAt: ["$updatedByOperator.username", 0] }
                ]
              }
            ]
          },
          partialAmount: 1,
          paymentStatus: 1,
          trackingID: "$parcelDetails.trackingID",
          status: "$parcelDetails.status",
          customer: "$customerDetails.username",
        }
      })

      pipeline.push({ $sort: { createdAt: -1 } });
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });
    } else if (findRole.role.includes("Operator")) {

      pipeline.push({
        $match: {
          officeID: new mongoose.Types.ObjectId(findRole.officeID)
        }
      })

      pipeline.push({
        $lookup: {
          from: "parcels",
          localField: "parcelID",
          foreignField: "_id",
          as: "parcelDetails"
        }
      })
      pipeline.push({
        $unwind: "$parcelDetails",
      });
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "parcelDetails.customerID",
          foreignField: "_id",
          as: "customerDetails"
        }
      })
      pipeline.push({
        $unwind: "$customerDetails",
      });
      pipeline.push({
        $lookup: {
          from: "admins",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByAdmin"
        }
      });
      pipeline.push({
        $lookup: {
          from: "agencies",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByAgency"
        }
      });
      pipeline.push({
        $lookup: {
          from: "operators",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedByOperator"
        }
      });
      pipeline.push({
        $project: {
          _id: 1,
          parcelID: 1,
          agencyID: 1,
          officeID: 1,
          pricePerKilo: 1,
          totalPrice: 1,
          actualCarrierCost: 1,
          grossProfit: 1,
          updatedBy: 1,
          updatedByType: 1,
          updatedByUsername: {
            $cond: [
              { $eq: ["$updatedByType", "Admin"] },
              { $arrayElemAt: ["$updatedByAdmin.username", 0] },
              {
                $cond: [
                  { $eq: ["$updatedByType", "Agency"] },
                  { $arrayElemAt: ["$updatedByAgency.agencyName", 0] },
                  { $arrayElemAt: ["$updatedByOperator.username", 0] }
                ]
              }
            ]
          },
          partialAmount: 1,
          paymentStatus: 1,
          trackingID: "$parcelDetails.trackingID",
          status: "$parcelDetails.status",
          customer: "$customerDetails.username",
        }
      })

      pipeline.push({ $sort: { createdAt: -1 } });
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });
    }


    const transaction = await TransactionModel.aggregate(pipeline);

    let countPipeline = [];

    if (findRole.role.includes("Agency")) {
      countPipeline.push({
        $match: {
          agencyID: new mongoose.Types.ObjectId(id)
        }
      })
    } else if (findRole.role.includes("Operator")) {
      countPipeline.push({
        $match: {
          officeID: new mongoose.Types.ObjectId(findRole.officeID)
        }
      })
    } else if (findRole.role.includes("Admin")) {
      countPipeline = []
    }
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await TransactionModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      transaction,
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
  HandleCreateParcel,
  HandleGetParcels,
  HandleGetTransaction,
  HandleGetSingleParcel,
  HandleGetAgencyParcels,
  HandleGetOfficeParcels,
  HandleUpdateParcelStatus,
  HandleBulkUpdateParcelStatus,
  HandleParcelReqFilters,
  HandleTrackParcel
};
