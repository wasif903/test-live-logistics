import mongoose from "mongoose";
const { Schema } = mongoose;

const TimeSlotSchema = new Schema({
  open: { type: String, required: true },  // e.g., "09:00"
  close: { type: String, required: true }, // e.g., "13:00"
}, { _id: false });

const DayScheduleSchema = new Schema({
  day: {
    type: String,
    enum: [
      "Monday", "Tuesday", "Wednesday", "Thursday",
      "Friday", "Saturday", "Sunday", "Holiday"
    ],
    required: true
  },
  slots: [TimeSlotSchema],
  closed: { type: Boolean, default: false }
}, { _id: false });

const OfficeSchema = new Schema({
  agencyID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "agencies",
    required: true,
  },
  officeName: {
    type: String,
    unique: true,
    required: true,
  },

  email: {
    type: String,
    default: ""
  },

  phone: {
    type: String,
    unique: true,
    required: true,
  },
  address: {
    street: { type: String, required: true },
    postalCode: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
  },
  openingHours: [DayScheduleSchema], // Dynamic structure added here
  role: {
    type: [String],
    enum: ["Office"],
    default: ["Office"],
  },
  status: {
    type: [String],
    enum: ["Active", "Blocked"],
    default: ["Active"],
  },

}, { timestamps: true });

const OfficeModel = mongoose.model("offices", OfficeSchema);
export default OfficeModel;
