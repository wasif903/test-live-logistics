// models/Operator.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const OperatorSchema = new Schema({
    username: {
        type: String,
        unique: true,
    },
    email: {
        type: String,
        unique: true,
    },
    phone: {
        type: String,
        unique: true,
    },
    password: String,
    role: {
        type: [String],
        enum: ["Operator"],
        default: ["Operator"],
    },
    status: {
        type: [String],
        enum: ["Active", "Blocked"],
        default: ["Active"],
    },
    agencyID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "agencies",
        required: true,
    },
    officeID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "offices", // assuming you have an Office model
        required: true,
    },
    refreshToken: String,
    otp: {
      type: String,
    },
    otpExpire: {
      type: Date,
    },
},{
    timestamps: true,
  });

const OperatorModel = mongoose.model("operators", OperatorSchema);
export default OperatorModel;
