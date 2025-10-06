import Joi from "joi";

const tagSchema = Joi.object({
    tagName: Joi.string().min(3).max(30).required(),
});

export {
    tagSchema
}