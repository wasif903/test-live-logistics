import ContactModel from "../models/ContactSchema.js";
import { normalizeFields } from "../utils/NormalizeString.js";
import RedisClient from "../utils/RedisClient.js";
import SearchQuery from "../utils/SearchQuery.js";

// CREATE CONTACT
// METHOD : POST
// ENDPOINT: /api/post-query
const HandleCreateContact = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, message, country } = req.body;

    const { email } = normalizeFields(req.body, [
      "email"
    ]);
    const normalizedPhone = phone?.trim();

    const existingContact = await ContactModel.findOne({
      firstName,
      lastName,
      email,
      phone: normalizedPhone,
    });

    if (existingContact) {
      return res.status(409).json({
        message: "We have received your query already",
        contact: existingContact,
      });
    }

    const newContact = new ContactModel({
      firstName,
      lastName,
      email,
      country,
      phone: normalizedPhone,
      message: message || "",
    });

    await newContact.save();

    await invalidateCacheGroup("contacts", "all");

    res.status(201).json({
      message: "Contact created successfully",
      contact: newContact,
    });
  } catch (err) {
    next(err);
  }
};


// GET QUERIES
// METHOD : GET
// ENDPOINT: api/get-queries?search[firstName]=john (WITH PAGINATION & FILTER)
const HandleGetQueries = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || {};
    const matchStage = SearchQuery(search);

    const pipeline = [];
    if (matchStage) pipeline.push(matchStage);
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const contacts = await ContactModel.aggregate(pipeline);

    const countPipeline = [];
    if (matchStage) countPipeline.push(matchStage);
    countPipeline.push({ $count: "totalItems" });

    const countResult = await ContactModel.aggregate(countPipeline);
    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      contacts,
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

export { HandleCreateContact, HandleGetQueries };
