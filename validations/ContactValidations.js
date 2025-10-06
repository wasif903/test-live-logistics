import Joi from "joi";

const contactSchema = Joi.object({
  firstName: Joi.string().min(3).max(30).required(),
  lastName: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  country: Joi.string().min(3).max(30).required(),
  message: Joi.string().min(3).max(150).optional(),
  phone: Joi.string().pattern(/^\d+$/).min(7).max(15).required().messages({
    "string.pattern.base": "Phone number must contain only digits.",
    "string.min": "Phone number is invalid.",
    "string.max": "Phone number is invalid.",
  }),
});


export { contactSchema };