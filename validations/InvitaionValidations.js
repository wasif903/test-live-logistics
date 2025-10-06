import Joi from "joi";

const InvitationSchema = Joi.object({
  emails: Joi.array().items(Joi.string().email().required()).min(1).required(),
});

export { InvitationSchema };
