import OfficeModel from "../models/OfficeSchema.js";
import AgencyModel from "../models/AgencySchema.js";
import { normalizeFields } from "../utils/NormalizeString.js";
import RedisClient from "../utils/RedisClient.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import SearchQuery from "../utils/SearchQuery.js";
import invalidateCacheGroup from "../utils/RedisCache.js";
import OperatorModel from "../models/OperatorSchema.js";
import TransactionModel from "../models/TransactionSchema.js";
import ParcelModel from "../models/ParcelSchema.js";
import UserModel from "../models/UserSchema.js";

// CREATE OFFICE
// METHOD : POST
// ENDPOINT: /api/office/create-office
const HandleCreateOffice = async (req, res, next) => {
  try {
    const { agencyID, officeName, phone, address, openingHours, role, status } =
      req.body;

    // Normalize key fields
    const { email: normalizedEmail } = normalizeFields(req.body, ["email"]);
    const normalizedPhone = phone?.trim();

    // Check if agency exists
    const agencyExists = await AgencyModel.findById(agencyID);
    if (!agencyExists) {
      return res.status(404).json({ message: "Agency not found" });
    }

    // Check for duplicates
    const existingOffice = await OfficeModel.findOne({
      $or: [{ phone: normalizedPhone }, { officeName }],
    });

    if (existingOffice) {
      return res
        .status(409)
        .json({ message: "Office with provided details already exists" });
    }

    // Create and save new office
    const newOffice = new OfficeModel({
      agencyID,
      officeName,
      email: normalizedEmail,
      phone: normalizedPhone,
      address,
      openingHours,
      role,
      status,
    });

    await newOffice.save();

    // Update agency's office count
    agencyExists.officeCount += 1;
    await agencyExists.save();

    // Invalidate caches
    await invalidateCacheGroup("get-all-offices", agencyID);

    res.status(201).json({
      message: "Office created successfully",
      office: newOffice,
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE OFFICE
// METHOD : PATCH
// ENDPOINT: /api/office/:agencyID/update-office/:officeID
const HandleUpdateOffice = async (req, res, next) => {
  try {
    const { agencyID, officeID } = req.params;

    const { officeName, email, phone, address, openingHours, role, status } =
      req.body;

    // Normalize key fields
    const { email: normalizedEmail } = normalizeFields(req.body, ["email"]);
    const normalizedPhone = phone?.trim();

    // Check if office exists
    const office = await OfficeModel.findById(officeID);
    if (!office) {
      return res.status(404).json({ message: "Office not found" });
    }

    // Check if agency exists
    const agencyExists = await AgencyModel.findById(agencyID);
    if (!agencyExists) {
      return res.status(404).json({ message: "Agency not found" });
    }

    // Check for duplicates (excluding current office)
    const duplicateOffice = await OfficeModel.findOne({
      _id: { $ne: officeID },
      agencyID: agencyID,
      $or: [{ phone: normalizedPhone }, { officeName }],
    });

    if (duplicateOffice) {
      return res
        .status(409)
        .json({ message: "Office with provided details already exists" });
    }

    // Update office
    office.agencyID = agencyID;
    office.officeName = officeName;
    office.email = normalizedEmail;
    office.phone = normalizedPhone;
    office.address = address;
    office.openingHours = openingHours;
    office.role = role;
    office.status = status;

    await office.save();

    // Invalidate cache
    await invalidateCacheGroup("get-all-offices", agencyID);

    res.status(200).json({
      message: "Office updated successfully",
      office,
    });
  } catch (err) {
    next(err);
  }
};

// GET ALL OFFICES
// METHOD : GET
// ENDPOINT: /api/office/:agencyID/get-all-offices (WITH PAGINATION & FILTER)
const HandleGetAllOffices = async (req, res, next) => {
  try {
    const { agencyID } = req.params;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    const pipeline = [];
    if (matchStage) pipeline.push(matchStage);
    pipeline.push({
      $match: { agencyID: new mongoose.Types.ObjectId(agencyID) },
    });
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const offices = await OfficeModel.aggregate(pipeline);

    const countPipeline = [{
      $match: { agencyID: new mongoose.Types.ObjectId(agencyID) },
    }];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await OfficeModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      offices,
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

// SINGLE OFFICE
// METHOD : GET
// ENDPOINT: /api/office/:agencyID/single-office/:officeID
const HandleGetSingleOffice = async (req, res, next) => {
  try {
    const { agencyID, officeID } = req.params;

    // Total Operators 
    const operatorPipeline = [
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID)
        }
      },
      { $count: "total" }
    ];
    const operatorCountResult = await OperatorModel.aggregate(operatorPipeline);
    const operatorCount = operatorCountResult[0]?.total || 0;


    // Pending Parcels
    const totalParcelPipeline = [{
      $match: {
        agencyID: new mongoose.Types.ObjectId(agencyID),
        officeID: new mongoose.Types.ObjectId(officeID),
      }
    }, { $count: "total" }];
    const totalParcelCountResult = await ParcelModel.aggregate(totalParcelPipeline);
    const parcelCount = totalParcelCountResult[0]?.total || 0;


    // Total Customers
    const customerPipeline = [{
      $match: {
        agencyID: new mongoose.Types.ObjectId(agencyID),
        officeID: new mongoose.Types.ObjectId(officeID),
      },
    }, {
      $count: "total"
    }];
    const customerCountResult = await UserModel.aggregate(customerPipeline);
    const customerCount = customerCountResult[0]?.total || 0;


    // Get month and year from query or default to current month/year
    let { parcelCountMonth, parcelCountYear } = req.query;
    const now = new Date();
    const month = parcelCountMonth ? parseInt(parcelCountMonth) : now.getMonth() + 1;
    const year = parcelCountYear ? parseInt(parcelCountYear) : now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 1);

    // Count parcels created in the given month
    const parcelsMonthPipeline = [
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID),
          createdAt: { $gte: startOfMonth, $lt: endOfMonth }
        }
      },
      { $count: "total" }
    ];
    const parcelsInMonthResult = await ParcelModel.aggregate(parcelsMonthPipeline);
    const parcelsInMonth = parcelsInMonthResult[0]?.total || 0;



    // Get transaction stats month and year from query or default to current month/year
    let { transactionStatsMonth, transactionStatsYear } = req.query;
    const transactionMonth = transactionStatsMonth ? parseInt(transactionStatsMonth) : now.getMonth() + 1;
    const transactionYear = transactionStatsYear ? parseInt(transactionStatsYear) : now.getFullYear();

    // Transaction statistics by month
    const transactionStats = await TransactionModel.aggregate([
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID),
          createdAt: { $type: "date" }
        }
      },
      {
        $addFields: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        }
      },
      { $match: { month: transactionMonth, year: transactionYear } },
      {
        $group: {
          _id: { month: "$month", year: "$year" },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$grossProfit",
                0
              ]
            }
          },
          expenses: {
            $sum: {
              $cond: [
                { $ne: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$totalPrice",
                0
              ]
            }
          },
          balance: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PARTIALLY PAID"] },
                "$partialAmount",
                0
              ]
            }
          }
        }
      },
      {
        $addFields: {
          month: "$_id.month",
          year: "$_id.year"
        }
      },
      {
        $project: {
          _id: 0,
          month: 1,
          year: 1,
          revenue: 1,
          expenses: 1,
          balance: 1
        }
      }
    ]);

    // Add month names
    const monthNames = [
      "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const transactionStatsWithNames = transactionStats.map(stat => ({
      ...stat,
      name: monthNames[stat.month]
    }));



    // Calculate pending payment and payment validated amounts for the same month/year
    const paymentSummary = await TransactionModel.aggregate([
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID),
          createdAt: { $type: "date" }
        }
      },
      {
        $addFields: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        }
      },
      { $match: { month: transactionMonth, year: transactionYear } },
      {
        $group: {
          _id: null,
          pendingPayment: {
            $sum: {
              $cond: [
                { $ne: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$totalPrice",
                0
              ]
            }
          },
          paymentValidated: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$grossProfit",
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          pendingPayment: 1,
          paymentValidated: 1
        }
      }
    ]);

    const pendingPayment = paymentSummary[0]?.pendingPayment || 0;
    const paymentValidated = paymentSummary[0]?.paymentValidated || 0;

    const transactionStatistics = {
      pendingPayment,
      paymentValidated,
      data: transactionStatsWithNames
    };

    // Top 3 countries by parcel count with office country lookup
    const topCountries = await ParcelModel.aggregate([
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID),
        }
      },
      {
        $lookup: {
          from: "offices",
          localField: "departureID",
          foreignField: "_id",
          as: "office"
        }
      },
      { $unwind: "$office" },
      {
        $group: {
          _id: "$office.address.country",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          country: "$_id",
          count: 1
        }
      }
    ]);

    // Get revenue month and year from query or default to current month/year
    let { revenueMonth, revenueYear } = req.query;
    const revenueMonthNum = revenueMonth ? parseInt(revenueMonth) : now.getMonth() + 1;
    const revenueYearNum = revenueYear ? parseInt(revenueYear) : now.getFullYear();

    // Revenue statistics summary for the same month/year
    const revenuePaymentSummary = await TransactionModel.aggregate([
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID),
          createdAt: { $type: "date" }
        }
      },
      {
        $addFields: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        }
      },
      { $match: { month: revenueMonthNum, year: revenueYearNum } },
      {
        $group: {
          _id: null,
          pendingPayment: {
            $sum: {
              $cond: [
                { $ne: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$totalPrice",
                0
              ]
            }
          },
          paymentValidated: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$grossProfit",
                0
              ]
            }
          },
          balance: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PARTIALLY PAID"] },
                "$partialAmount",
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          pendingPayment: 1,
          paymentValidated: 1,
          balance: 1
        }
      }
    ]);
    const revenuePendingPayment = revenuePaymentSummary[0]?.pendingPayment || 0;
    const revenuePaymentValidated = revenuePaymentSummary[0]?.paymentValidated || 0;
    const revenueBalance = revenuePaymentSummary[0]?.balance || 0;

    // Revenue statistics data array for the same month/year
    const revenueStats = await TransactionModel.aggregate([
      {
        $match: {
          agencyID: new mongoose.Types.ObjectId(agencyID),
          officeID: new mongoose.Types.ObjectId(officeID),
          createdAt: { $type: "date" }
        }
      },
      {
        $addFields: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        }
      },
      { $match: { month: revenueMonthNum, year: revenueYearNum } },
      {
        $group: {
          _id: { month: "$month", year: "$year" },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$grossProfit",
                0
              ]
            }
          },
          expenses: {
            $sum: {
              $cond: [
                { $ne: ["$paymentStatus", "PAYMENT VALIDATED"] },
                "$totalPrice",
                0
              ]
            }
          },
          balance: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PARTIALLY PAID"] },
                "$partialAmount",
                0
              ]
            }
          }
        }
      },
      {
        $addFields: {
          month: "$_id.month",
          year: "$_id.year"
        }
      },
      {
        $project: {
          _id: 0,
          month: 1,
          year: 1,
          revenue: 1,
          expenses: 1,
          balance: 1
        }
      }
    ]);
    const revenueStatsWithNames = revenueStats.map(stat => ({
      ...stat,
      name: monthNames[stat.month]
    }));
    const revenueStatistics = {
      pendingPayment: revenuePendingPayment,
      paymentValidated: revenuePaymentValidated,
      balance: revenueBalance,
      data: revenueStatsWithNames
    };

    const office = await OfficeModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(officeID),
          agencyID: new mongoose.Types.ObjectId(agencyID),
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "agencyID",
          foreignField: "_id",
          as: "agencyInfo",
        },
      },
      {
        $unwind: "$agencyInfo",
      },
      {
        $project: {
          officeName: 1,
          email: 1,
          phone: 1,
          address: 1,
          openingHours: 1,
          role: 1,
          status: 1,
          agencyID: 1,
          agencyName: "$agencyInfo.agencyName",
          agencyEmail: "$agencyInfo.email",
          createdAt: 1,
        },
      },
    ]);

    if (!office.length) {
      return res.status(404).json({ message: "Invalid Agency or Office ID" });
    }

    res.status(200).json({ office: office[0], operatorCount, parcelCount, customerCount, parcelsInMonth, transactionStatistics, topCountries, revenueStatistics });
  } catch (err) {
    next(err);
  }
};



export {
  HandleCreateOffice,
  HandleUpdateOffice,
  HandleGetSingleOffice,
  HandleGetAllOffices,
};
