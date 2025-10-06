import mongoose from "mongoose";
const { Schema } = mongoose;

const ParcelSchema = new Schema(
  {
    trackingID: {
      type: String,
      required: true,
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

    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    weight: {
      type: Number,
      required: true,
    },

    transportMethod: {
      type: String,
      enum: ["Air", "Sea"],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "RECEIVED IN WAREHOUSE",
        "WAITING TO BE GROUPED",
        "READY FOR SHIPMENT",
        "SHIPPED",
        "IN TRANSIT",
        "ARRIVED AT DESTINATION OFFICE",
        "WAITING FOR WITHDRAWAL",
        "DELIVERED/PICKED UP",
        "UNCLAIMED PACKAGE",
      ],
      required: true,
    },

    departureID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "offices",
      required: true,
    },

    destinationID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "offices",
      required: true,
    },

    estimateArrival: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    mixedPackage: {
      type: Boolean,
      required: true,
    },

    whatsappNotif: {
      type: Boolean,
      required: true,
    },

    notificationCost: {
      type: Number,
      default: null,
      set: function(value) {
        if (value === "null" || value === null) {
          return null;
        }
        return value;
      }
    },

    tagID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "tags",
      default: null,
    },

    packagePicture: {
      type: [String],
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    createdByType: {
      type: String,
      enum: ["Admin", "Agency", "Operator", "User"],
      required: true,
    },
  },
  { timestamps: true }
);

ParcelSchema.index({ trackingID: 1 }, { unique: true });

ParcelSchema.index({ departureID: 1, tagID: 1 });

const ParcelModel = mongoose.model("parcels", ParcelSchema);

export default ParcelModel;
