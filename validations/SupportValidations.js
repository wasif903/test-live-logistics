import Joi from "joi";

const SupportSchema = Joi.object({
    title: Joi.string().min(3).max(100).required(),
    description: Joi.string().min(50).max(300).required(),
});

export {
    SupportSchema
}