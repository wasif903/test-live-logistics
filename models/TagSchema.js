import mongoose from "mongoose";
const { Schema } = mongoose;

const TagSchema = new Schema({
  agencyID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "agencies"
  },
  officeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "offices"
  },
  tagName: {
    type: String,
    required: true
  }
}, {timestamps: true});

const TagModel = mongoose.model("tags", TagSchema);
export default TagModel;
