import mongoose from "mongoose";
const { Schema } = mongoose;

const TransactionTrackingSchema = new Schema(
  {
    transactionID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "transactions",
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

TransactionTrackingSchema.index({ transactionID: 1 });

const TransactionTrackingModel = mongoose.model(
  "transaction_trackings",
  TransactionTrackingSchema
);

export default TransactionTrackingModel;
