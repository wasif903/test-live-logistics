import Joi from "joi";

const agencySchema = Joi.object({
    agencyName: Joi.string().min(3).max(30).required(),
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
});

const updateAgencySchema = Joi.object({
    agencyName: Joi.string().min(3).max(30).required(),
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
});


export {
    agencySchema,
    updateAgencySchema
}