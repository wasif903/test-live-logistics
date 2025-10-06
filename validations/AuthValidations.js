import Joi from "joi";

const adminSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const userSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  country: Joi.string().required(),
  countryCode: Joi.string()
    .length(2)
    .uppercase()
    .pattern(/^[A-Z]{2}$/)
    .required()
    .messages({
      "string.length": "Country code must be exactly 2 letters.",
      "string.pattern.base": "Country code must be two uppercase letters.",
    }),
  phone: Joi.string().pattern(/^\d+$/).min(7).max(15).required().messages({
    "string.pattern.base": "Phone number must contain only digits.",
    "string.min": "Phone number is invalid.",
    "string.max": "Phone number is invalid.",
  }),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  createdBy: Joi.string().length(24).hex().required(),
});

const loginSchema = Joi.object({
  identifier: Joi.string().required(),
  password: Joi.string().required(),
});

export { adminSchema, loginSchema, userSchema };
