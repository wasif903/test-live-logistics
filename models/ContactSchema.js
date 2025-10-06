import mongoose from "mongoose";
const { Schema } = mongoose;

const ContactSchema = new Schema(
  {
    firstName: {
      type: String,
      unique: true,
    },
    lastName: {
      type: String,
      unique: true,
    },
    email: {
      type: String,
      unique: true,
    },
    country: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    message: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

ContactSchema.pre("save", function (next) {
  this.firstName = this.firstName?.trim().toLowerCase();
  this.lastName = this.lastName?.trim().toLowerCase();
  this.email = this.email?.trim().toLowerCase();
  this.phone = this.phone?.trim();
  next();
});

ContactSchema.index({ email: 1, phone: 1 }, { unique: true });

const ContactModel = mongoose.model("contacts", ContactSchema);
export default ContactModel;
