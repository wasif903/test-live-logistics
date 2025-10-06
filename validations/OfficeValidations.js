import Joi from "joi";

const timeSlotSchema = Joi.object({
  open: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
  close: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
}).custom((value, helpers) => {
  const [openHour, openMin] = value.open.split(":").map(Number);
  const [closeHour, closeMin] = value.close.split(":").map(Number);
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  if (openMinutes >= closeMinutes) {
    return helpers.error("any.invalid", {
      message: "Open time must be before close time.",
    });
  }

  return value;
}, "Open < Close validation");


const dayScheduleSchema = Joi.object({
  day: Joi.string().valid(
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday", "Holiday"
  ).required(),
  slots: Joi.array().items(timeSlotSchema),
  closed: Joi.boolean().default(false),
});

const officeSchema = Joi.object({
  agencyID: Joi.string().length(24).hex().required(),
  officeName: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^\d+$/).min(7).max(15).required().messages({
    "string.pattern.base": "Phone number must contain only digits.",
    "string.min": "Phone number is too short.",
    "string.max": "Phone number is too long.",
  }),
  address: Joi.object({
    street: Joi.string().min(3).max(100).required(),
    postalCode: Joi.string().min(3).max(20).required(),
    city: Joi.string().min(2).max(50).required(),
    country: Joi.string().min(2).max(50).required(),
  }).required(),
  openingHours: Joi.array().items(dayScheduleSchema),
  role: Joi.array().items(Joi.string().valid("Office")).default(["Office"]),
  status: Joi.array().items(Joi.string().valid("Active", "Blocked")).default(["Active"]),
});

export { officeSchema };
