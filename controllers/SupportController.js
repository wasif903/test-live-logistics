import ExtractRelativeFilePath from "../middlewares/ExtractRelativePath.js"
import AdminModel from "../models/AdminSchema.js"
import AgencyModel from "../models/AgencySchema.js"
import OperatorModel from "../models/OperatorSchema.js"
import SupportModel from "../models/SupportSchema.js"
import SearchQuery from "../utils/SearchQuery.js"
import mongoose from "mongoose"



// CREATE TICKETS
// METHOD : POST
// ENDPOINT: api/support/submit-ticket/:createdBy
const HandleCreateSupport = async (req, res, next) => {
    try {
        const {
            createdBy
        } = req.params
        const {
            title,
            description
        } = req.body

        const images = req.files.images || [];
        const imagePaths = images.map((item) => ExtractRelativeFilePath(item))

        console.log(title)
        console.log(description)
        console.log(imagePaths)

        const findRole = (await AgencyModel.findById(createdBy)) || (await OperatorModel.findById(createdBy))

        if (!findRole) {
            return res.status(400).json({ message: "User Not Found" })
        }

        const createSupport = new SupportModel({
            createdByRole: findRole.role[0],
            CreatedBy: findRole._id,
            title,
            description,
            images: imagePaths
        })

        await createSupport.save();

        res.status(200).json({ message: "Ticket Has Been Generated Succefully" })


    } catch (error) {
        next(error)
    }
}


// GET TICKETS
// METHOD : GET
// ENDPOINT: api/support/:adminID/get-tickets?search[status]=Pending
const HandleGetSupport = async (req, res, next) => {
    try {

        const { adminID } = req.params;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const search = req.query.search || {};
        const matchStage = SearchQuery(search);

        const validateAdmin = await AdminModel.findById(adminID);
        if (!validateAdmin) {
            return res.status(404).json({ message: "Admin Not Found" })
        }

        const pipeline = []
        if (matchStage) pipeline.push(matchStage);

        // Lookup for creator info (Agency)
        pipeline.push({
            $lookup: {
                from: "agencies",
                let: { createdBy: "$CreatedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $in: [{ $literal: "Agency" }, "$role"] },
                                    { $eq: ["$_id", "$$createdBy"] },
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
                as: "createdByAgency",
            },
        });

        // Lookup for creator info (Operator)
        pipeline.push({
            $lookup: {
                from: "operators",
                let: { createdBy: "$CreatedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $in: [{ $literal: "Operator" }, "$role"] },
                                    { $eq: ["$_id", "$$createdBy"] },
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
                as: "createdByOperator",
            },
        });

        // Add createdByInfo field
        pipeline.push({
            $addFields: {
                createdByInfo: {
                    $cond: [
                        { $gt: [{ $size: "$createdByAgency" }, 0] },
                        { $arrayElemAt: ["$createdByAgency", 0] },
                        {
                            $cond: [
                                { $gt: [{ $size: "$createdByOperator" }, 0] },
                                { $arrayElemAt: ["$createdByOperator", 0] },
                                null,
                            ],
                        },
                    ],
                },
            },
        });

        // Project fields
        pipeline.push({
            $project: {
                _id: 1,
                title: 1,
                description: 1,
                images: 1,
                status: 1,
                createdByRole: 1,
                createdByID: "$createdByInfo._id",
                createdByName: "$createdByInfo.username",
                createdAt: 1,
                updatedAt: 1,
            },
        });

        pipeline.push({ $sort: { createdAt: -1 } });
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const tickets = await SupportModel.aggregate(pipeline)


        const countPipeline = []
        countPipeline.push({ $count: "totalItems" });
        const countResult = await SupportModel.aggregate(countPipeline);
        const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
        const totalPages = Math.ceil(totalItems / limit);


        res.status(200).json({
            tickets,
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


// GET SINGLE TICKETS
// METHOD : GET
// ENDPOINT: api/support/:adminID/get-single-ticket/:ticketID
const HandleGetSingleTicket = async (req, res, next) => {
    try {
        const { adminID, ticketID } = req.params;

        const findAdmin = await AdminModel.findById(adminID);
        if (!findAdmin) {
            return res.status(404).json({ message: "Admin Not Found" });
        }

        const pipeline = [
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(ticketID)
                }
            },
            // Lookup for creator info (Agency)
            {
                $lookup: {
                    from: "agencies",
                    let: { createdBy: "$CreatedBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $in: [{ $literal: "Agency" }, "$role"] },
                                        { $eq: ["$_id", "$$createdBy"] },
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
                    as: "createdByAgency",
                },
            },
            // Lookup for creator info (Operator)
            {
                $lookup: {
                    from: "operators",
                    let: { createdBy: "$CreatedBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $in: [{ $literal: "Operator" }, "$role"] },
                                        { $eq: ["$_id", "$$createdBy"] },
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
                    as: "createdByOperator",
                },
            },
            // Add createdByInfo field
            {
                $addFields: {
                    createdByInfo: {
                        $cond: [
                            { $gt: [{ $size: "$createdByAgency" }, 0] },
                            { $arrayElemAt: ["$createdByAgency", 0] },
                            {
                                $cond: [
                                    { $gt: [{ $size: "$createdByOperator" }, 0] },
                                    { $arrayElemAt: ["$createdByOperator", 0] },
                                    null,
                                ],
                            },
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    description: 1,
                    images: 1,
                    status: 1,
                    createdByRole: 1,
                    createdByID: "$createdByInfo._id",
                    createdByName: "$createdByInfo.username",
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        ];

        const tickets = await SupportModel.aggregate(pipeline);

        if (tickets.length === 0) {
            return res.status(404).json({ message: "Ticket Not Found" });
        }

        res.status(200).json({
            message: "Single Ticket Retrieved Successfully",
            ticket: tickets[0],
        });

    } catch (error) {
        next(error);
    }
};


// UPDATE SUPPORT TICKET STATUS
// METHOD : PATCH
// ENDPOINT: /api/support/:adminID/update-ticket-status/:ticketID
// BODY: { status: "Pending" | "Resolved" | "In-Progress" }
const HandleUpdateTicketStatus = async (req, res, next) => {
    try {
        const { adminID, ticketID } = req.params;
        const { status } = req.body;

        console.log(status)

        // Validate admin
        const findAdmin = await AdminModel.findById(adminID);
        if (!findAdmin) {
            return res.status(404).json({ message: "Admin Not Found" });
        }

        // Validate status
        const allowedStatuses = ["Resolved", "Pending", "In-Progress"];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        // Update ticket
        const updated = await SupportModel.findByIdAndUpdate(
            ticketID,
            { status },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Ticket Not Found" });
        }

        res.status(200).json({
            message: "Ticket status updated successfully",
        });
    } catch (error) {
        next(error);
    }
};


export {
    HandleCreateSupport,
    HandleGetSupport,
    HandleGetSingleTicket,
    HandleUpdateTicketStatus
}