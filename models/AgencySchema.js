import mongoose from "mongoose";
const { Schema } = mongoose;

const AgencySchema = new Schema(
  {
    agencyName: {
      type: String,
      unique: true,
    },
    companyCode: {
      type: String,
      unique: true,
    },
    username: {
      type: String,
      unique: true,
    },
    email: {
      type: String,
      unique: true,
    },
    password: String,
    role: {
      type: [String],
      enum: ["Agency"],
      default: ["Agency"],
    },
    status: {
      type: [String],
      enum: ["Active", "Blocked"],
      default: ["Active"],
    },
    officeCount: {
      type: Number,
      default: 0,
    },
    refreshToken: String,
    otp: {
      type: String,
    },
    otpExpire: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

AgencySchema.index({ companyCode: 1, agencyName: 1 }, { unique: true });

const AgencyModel = mongoose.model("agencies", AgencySchema);
export default AgencyModel;
