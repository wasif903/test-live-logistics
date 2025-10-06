import Joi from "joi";

const operatorSchema = Joi.object({
    username: Joi.string().min(3).max(30).required(),
    phone: Joi.string().pattern(/^\d+$/).min(7).max(15).required().messages({
        "string.pattern.base": "Phone number must contain only digits.",
        "string.min": "Phone number is invalid.",
        "string.max": "Phone number is invalid.",
    }),
    password: Joi.string().min(6).required(),
});


export {
    operatorSchema
}