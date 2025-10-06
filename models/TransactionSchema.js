import mongoose from "mongoose";
const { Schema } = mongoose;

const TransactionSchema = new Schema({
  parcelID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "parcels",
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

  pricePerKilo: {
    type: Number,
    required: true,
  },

  totalPrice: {
    type: Number,
    required: true,
  },

  actualCarrierCost: {
    type: Number,
    required: true,
  },

  grossProfit: {
    type: Number,
    required: true,
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  updatedByType: {
    type: String,
    enum: ["Admin", "Agency", "Operator"],
  },

  partialAmount: {
    type: Number,
    default: null,
    set: function(value) {
      if (value === "null" || value === null) {
        return null;
      }
      return value;
    }
  },

  paymentStatus: {
    type: String,
    enum: [
      "PENDING PAYMENT",
      "PARTIALLY PAID",
      "DEFERRED PAYMENT",
      "PAYMENT VALIDATED",
      "PAYMENT FAILED",
      "PAYMENT CANCELLED",
    ],
    default: "PENDING PAYMENT",
  },
},
  { timestamps: true });

TransactionSchema.index(
  { parcelID: 1, agencyID: 1, officeID: 1 },
);

const TransactionModel = mongoose.model("transactions", TransactionSchema);

export default TransactionModel;
