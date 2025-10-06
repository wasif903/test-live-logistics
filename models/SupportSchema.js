import mongoose from "mongoose";
const { Schema } = mongoose;

const SupportSchema = new Schema({
    CreatedBy: {
        type: mongoose.Schema.Types.ObjectId,
    },
    createdByRole: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    images: {
        type: [String],
    },
    status: {
        type: String,
        enum: ["Resolved", "Pending", "In-Progress"],
        default: "Pending"
    }
}, { timestamps: true });

const SupportModel = mongoose.model("supports", SupportSchema);
export default SupportModel;
