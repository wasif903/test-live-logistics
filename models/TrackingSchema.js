import mongoose from "mongoose";
const { Schema } = mongoose;

const TrackingSchema = new Schema(
  {
    parcelID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "parcels",
    },

    trackingID: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    manualDate: {
      type: Date,
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    updatedByType: {
      type: String,
      enum: ["Admin", "Agency", "Operator"],
    },
  },
  { timestamps: true }
);

TrackingSchema.index({ parcelID: 1 });

const TrackingModel = mongoose.model("parcel_tracking", TrackingSchema);

export default TrackingModel;
