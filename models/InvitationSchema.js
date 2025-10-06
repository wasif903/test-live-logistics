// models/Invitation.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const InvitationSchema = new Schema({
  email: {
    type: String,
    required: true,
    index: true,
  },
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
  token: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

const InvitationModel = mongoose.model("invitations", InvitationSchema);
export default InvitationModel;
