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
import { DashboardAdmin, DashboardAgency, DashboardOffice } from "../helpers/DashboardDataHelper.js";



const HandleGetDashboardData = async (req, res, next) => {
  try {

    const { id } = req.query;

    const findRole = await AdminModel.findById(id) || await OperatorModel.findById(id) || await AgencyModel.findById(id);

    if (!findRole) {
      return res.status(404).json({ message: "Invalid ID params" })
    }

    if (findRole.role.includes("Admin")) {
      return DashboardAdmin(req, res, next);
    } else if (findRole.role.includes("Agency")) {
      return DashboardAgency(req, res, next, findRole)
    } else if (findRole.role.includes("Operator")) {
      return DashboardOffice(req, res, next, findRole)
    }


  } catch (error) {
    next(error)
  }
}


export { HandleGetDashboardData }
