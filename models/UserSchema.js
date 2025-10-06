import mongoose from "mongoose";
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    agencyID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "agencies",
      required: true,
    },
    officeID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "offices",
      required: true,
    },
    username: {
      type: String,
      unique: true,
    },
    country: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      unique: true,
    },
    password: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    role: {
      type: [String],
      enum: ["User"],
      default: ["User"],
    },
    refreshToken: String,
    otp: {
      type: String,
    },
    otpExpire: {
      type: Date,
    },
  },
  { timestamps: true }
);
const UserModel = mongoose.model("users", UserSchema);
export default UserModel;
