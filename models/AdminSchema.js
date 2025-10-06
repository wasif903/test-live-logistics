import mongoose from "mongoose";
const { Schema } = mongoose;

const AdminSchema = new Schema({
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
    enum: ["Admin"],
    default: ["Admin"],
  },
  refreshToken: String,
  otp: {
    type: String,
  },
  otpExpire: {
    type: Date,
  },
}, {
  timestamps: true,
});
const AdminModel = mongoose.model("admins", AdminSchema);
export default AdminModel;
