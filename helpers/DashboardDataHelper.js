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


const DashboardAdmin = async (req, res, next) => {
    try {


        // Total Agencies 
        const agencyPipeline = [{ $count: "total" }];
        const agencyCountResult = await AgencyModel.aggregate(agencyPipeline);
        const agencyCount = agencyCountResult[0]?.total || 0;

        // Pending Parcels
        const pendingParcelPipeline = [{ $match: { status: { $nin: ["DELIVERED/PICKED UP", "UNCLAIMED PACKAGE"] } } }, { $count: "total" }];
        const pendingParcelCountResult = await ParcelModel.aggregate(pendingParcelPipeline);
        const pendingParcelCount = pendingParcelCountResult[0]?.total || 0;

        // Total Parcels
        const totalParcelPipeline = [{ $count: "total" }];
        const totalParcelCountResult = await ParcelModel.aggregate(totalParcelPipeline);
        const totalParcelCount = totalParcelCountResult[0]?.total || 0;

        // Total Customers
        const customerPipeline = [{ $count: "total" }];
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
            { $match: { createdAt: { $gte: startOfMonth, $lt: endOfMonth } } },
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
            { $match: { createdAt: { $type: "date" } } },
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
            { $match: { createdAt: { $type: "date" } } },
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
            { $match: { createdAt: { $type: "date" } } },
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
            { $match: { createdAt: { $type: "date" } } },
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

        res.status(200).json({ agencyCount, pendingParcelCount, totalParcelCount, customerCount, parcelsInMonth, transactionStatistics, topCountries, revenueStatistics });
    } catch (error) {
        next(error)
    }
}


const DashboardAgency = async (req, res, next, agency) => {

    try {

        // Total Agencies 
        const officePipeline = [
            {
                $match: {
                    agencyID: new mongoose.Types.ObjectId(agency._id)
                }
            },
            { $count: "total" }
        ];
        const officeCountResult = await OfficeModel.aggregate(officePipeline);
        const officeCount = officeCountResult[0]?.total || 0;

        // Pending Parcels
        const pendingParcelPipeline = [{
            $match: {
                agencyID: new mongoose.Types.ObjectId(agency._id),
                status: { $nin: ["DELIVERED/PICKED UP", "UNCLAIMED PACKAGE"] }
            }
        }, { $count: "total" }];
        const pendingParcelCountResult = await ParcelModel.aggregate(pendingParcelPipeline);
        const pendingParcelCount = pendingParcelCountResult[0]?.total || 0;

        // Total Parcels
        const totalParcelPipeline = [{
            $match: {
                agencyID: new mongoose.Types.ObjectId(agency._id),
            },
        }, {
            $count: "total"
        }];
        const totalParcelCountResult = await ParcelModel.aggregate(totalParcelPipeline);
        const totalParcelCount = totalParcelCountResult[0]?.total || 0;

        // Total Customers
        const customerPipeline = [{
            $match: {
                agencyID: new mongoose.Types.ObjectId(agency._id),
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
                    agencyID: new mongoose.Types.ObjectId(agency._id),
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
                    agencyID: new mongoose.Types.ObjectId(agency._id),
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
                    agencyID: new mongoose.Types.ObjectId(agency._id),
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
                    agencyID: new mongoose.Types.ObjectId(agency._id),
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
                    agencyID: new mongoose.Types.ObjectId(agency._id),
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
                    agencyID: new mongoose.Types.ObjectId(agency._id),
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

        res.status(200).json({ officeCount, pendingParcelCount, totalParcelCount, customerCount, parcelsInMonth, transactionStatistics, topCountries, revenueStatistics });
    } catch (error) {

        next(error)
    }
}


const DashboardOffice = async (req, res, next, operator) => {

    try {

        // Pending Parcels
        const pendingParcelPipeline = [{
            $match: {
                officeID: new mongoose.Types.ObjectId(operator.officeID),
                agencyID: new mongoose.Types.ObjectId(operator.agencyID),
                status: { $nin: ["DELIVERED/PICKED UP", "UNCLAIMED PACKAGE"] }
            }
        }, { $count: "total" }];
        const pendingParcelCountResult = await ParcelModel.aggregate(pendingParcelPipeline);
        const pendingParcelCount = pendingParcelCountResult[0]?.total || 0;

        // Total Parcels
        const totalParcelPipeline = [{
            $match: {
                officeID: new mongoose.Types.ObjectId(operator.officeID),
                agencyID: new mongoose.Types.ObjectId(operator.agencyID),
            },
        }, {
            $count: "total"
        }];
        const totalParcelCountResult = await ParcelModel.aggregate(totalParcelPipeline);
        const totalParcelCount = totalParcelCountResult[0]?.total || 0;

        // Total Customers
        const customerPipeline = [{
            $match: {
                officeID: new mongoose.Types.ObjectId(operator.officeID),
                agencyID: new mongoose.Types.ObjectId(operator.agencyID)
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
                    officeID: new mongoose.Types.ObjectId(operator.officeID),
                    agencyID: new mongoose.Types.ObjectId(operator.agencyID),
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
                    officeID: new mongoose.Types.ObjectId(operator.officeID),
                    agencyID: new mongoose.Types.ObjectId(operator.agencyID),
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
                    officeID: new mongoose.Types.ObjectId(operator.officeID),
                    agencyID: new mongoose.Types.ObjectId(operator.agencyID),
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
                    officeID: new mongoose.Types.ObjectId(operator.officeID),
                    agencyID: new mongoose.Types.ObjectId(operator.agencyID)
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
                    officeID: new mongoose.Types.ObjectId(operator.officeID),
                    agencyID: new mongoose.Types.ObjectId(operator.agencyID),
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
                    officeID: new mongoose.Types.ObjectId(operator.officeID),
                    agencyID: new mongoose.Types.ObjectId(operator.agencyID),
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

        res.status(200).json({ pendingParcelCount, totalParcelCount, customerCount, parcelsInMonth, transactionStatistics, topCountries, revenueStatistics });
    } catch (error) {

        next(error)
    }
}

export {
    DashboardAdmin,
    DashboardAgency,
    DashboardOffice
}