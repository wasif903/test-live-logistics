// controllers/inviteController.js
import crypto from "crypto";
// import OperatorModel from "../models/OperatorSchema.js";
import InvitationModel from "../models/InvitationSchema.js";
import autoMailer from "../utils/AutoMailer.js";
import AgencyModel from "../models/AgencySchema.js";
import AdminModel from "../models/AdminSchema.js";
import OfficeModel from "../models/OfficeSchema.js";
import SearchQuery from "../utils/SearchQuery.js";

// SEND BULK INVITATION
// METHOD : POST
// ENDPOINT: /api/invite/:agencyID/send-invitations/:officeID
const HandleSendBulkInvitations = async (req, res) => {
  const { emails } = req.body;
  const { agencyID, officeID } = req.params;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ message: "Emails are required" });
  }

  const findAgency = await AgencyModel.findById(agencyID);
  if (!findAgency) {
    return res.status(404).json({ message: "Agency not found" });
  }

  const findOffice = await OfficeModel.findOne({
    _id: officeID,
    agencyID: agencyID,
  });
  if (!findOffice) {
    return res.status(404).json({ message: "Office not found" });
  }

  const results = [];

  for (const email of emails) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const invitation = new InvitationModel({
      email,
      agencyID,
      officeID,
      token,
      expiresAt,
    });

    await invitation.save();

    const link = `http://localhost:3000/invite-operator/${token}`;

    autoMailer({
      from: "admin@tactix.asia",
      to: email,
      subject: `Welcome to our platform, FLUXELIO`,
      message: `<h1 style="font-family: Arial, sans-serif; color: #2c3e50;">Welcome to our platform</h1>
            <br/>
            <h3 style="font-family: Arial, sans-serif; color: #34495e;">
               <strong>you have been invited by the ${findAgency.agencyName} to join ${findOffice.officeName} </strong>
               <br/>
               <a href="${link}">Click here to accept the invitation</a>
            </h3>`,
    });

    results.push({ email, link });
  }

  res.status(200).json({
    message: "Invitations sent",
    invitations: results,
  });
};

// GET INVITATION HISTORY
// METHOD : GET
// ENDPOINT: /api/invite/:adminID/get-invitations
const HandleGetInvitations = async (req, res, next) => {
  try {

    const { adminID } = req.params;

    const findAdmin = await AdminModel.findById(adminID);
    if (!findAdmin) {
      return res.status(400).json({ message: "Invalid Parmeters Provided" })
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    if (matchStage) pipeline.push(matchStage);
    const pipeline = [];
    pipeline.push({
      $lookup: {
        from: "agencies",
        localField: "agencyID",
        foreignField: "_id",
        as: "agency",
      },
    });
    pipeline.push({
      $unwind: "$agency",
    });
    pipeline.push({
      $lookup: {
        from: "offices",
        localField: "officeID",
        foreignField: "_id",
        as: "office",
      },
    });
    pipeline.push({
      $unwind: "$office",
    });
    pipeline.push({
      $project: {
        _id: 1,
        email: 1,
        expiresAt: 1,
        used: 1,
        createdAt: 1,
        updatedAt: 1,
        agency: {
          _id: "$agency._id",
          agencyName: "$agency.agencyName",
          companyCode: "$agency.companyCode"
        },
        office: {
          _id: "$office._id",
          officeName: "$office.officeName",
        },
      }
    });
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const invites = await InvitationModel.aggregate(pipeline);

    const countPipeline = [];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await InvitationModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      invites,
      meta: {
        totalItems,
        totalPages,
        page,
        limit,
      },
    });

  } catch (error) {
    console.log(error);
    next(error)
  }
}

export { HandleSendBulkInvitations, HandleGetInvitations };

