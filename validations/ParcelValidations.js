import Joi from "joi";

const parcelSchema = Joi.object({
  weight: Joi.number().required(),
  transportMethod: Joi.string().valid("Air", "Sea").required(),
  destinationID: Joi.string().length(24).hex().required(),
  customerID: Joi.string().length(24).hex().required(),
  createdBy: Joi.string().length(24).hex().required(),
  tagID: Joi.when("mixedPackage", {
    is: true,
    then: Joi.string().custom((value, helpers) => {
      if (value === "null" || value === null) {
        return helpers.error('any.invalid', { message: 'Tag ID is required when mixed package is enabled' });
      }
      if (value.length !== 24) {
        return helpers.error('string.length', { message: 'Tag ID must be exactly 24 characters long' });
      }
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        return helpers.error('string.hex', { message: 'Tag ID must contain only hexadecimal characters' });
      }
      return value;
    }).required().messages({
      'any.required': 'Tag ID is required when mixed package is enabled',
      'any.invalid': 'Tag ID is required when mixed package is enabled'
    }),
    otherwise: Joi.valid(null, "null").required().messages({
      'any.required': 'Tag ID must be null when mixed package is disabled',
      'any.only': 'Tag ID must be null when mixed package is disabled'
    }),
  }),
  notificationCost: Joi.when('whatsappNotif', {
    is: true,
    then: Joi.number().required().messages({
      'any.required': 'Notification cost is required when WhatsApp notification is enabled',
      'number.base': 'Notification cost must be a number'
    }),
    otherwise: Joi.valid(null, "null").required().messages({
      'any.required': 'Notification cost must be null when WhatsApp notification is disabled',
      'any.only': 'Notification cost must be null when WhatsApp notification is disabled'
    }),
  }),
  estimateArrival: Joi.string().required(),
  description: Joi.string().optional(),
  mixedPackage: Joi.boolean().required(),
  whatsappNotif: Joi.boolean().required(),
  pricePerKilo: Joi.number().required(),
  actualCarrierCost: Joi.number().required(),
  paymentStatus: Joi.string().valid(
    "PENDING PAYMENT",
    "PARTIALLY PAID",
    "DEFERRED PAYMENT",
    "PAYMENT VALIDATED",
    "PAYMENT FAILED",
    "PAYMENT CANCELLED"
  ).required(),
  partialAmount: Joi.when('paymentStatus', {
    is: 'PARTIALLY PAID',
    then: Joi.number().required().min(0.01).messages({
      'any.required': 'partial amount is required when payment status is PARTIALLY PAID',
      'number.base': 'partial amount must be a number',
      'number.min': 'partial amount must be greater than 0'
    }),
    otherwise: Joi.valid(null, "null").optional().messages({
      'any.only': 'partial amount must be null when payment status is not PARTIALLY PAID'
    }),
  }),
  status: Joi.string().valid(
    "RECEIVED IN WAREHOUSE",
    "WAITING TO BE GROUPED",
    "READY FOR SHIPMENT",
    "SHIPPED",
    "IN TRANSIT",
    "ARRIVED AT DESTINATION OFFICE",
    "WAITING FOR WITHDRAWAL",
    "DELIVERED/PICKED UP",
    "UNCLAIMED PACKAGE"
  ).required()

});


const updateParcelSchema = Joi.object({
  status: Joi.string().valid(
    "RECEIVED IN WAREHOUSE",
    "WAITING TO BE GROUPED",
    "READY FOR SHIPMENT",
    "SHIPPED",
    "IN TRANSIT",
    "ARRIVED AT DESTINATION OFFICE",
    "WAITING FOR WITHDRAWAL",
    "DELIVERED/PICKED UP",
    "UNCLAIMED PACKAGE"
  ).required(),
  paymentStatus: Joi.string().valid(
    "PENDING PAYMENT",
    "PARTIALLY PAID",
    "DEFERRED PAYMENT",
    "PAYMENT VALIDATED",
    "PAYMENT FAILED",
    "PAYMENT CANCELLED"
  ).required(),
  partialAmount: Joi.when('paymentStatus', {
    is: 'PARTIALLY PAID',
    then: Joi.number().required().min(0.01).messages({
      'any.required': 'partial amount is required when payment status is PARTIALLY PAID',
      'number.base': 'partial amount must be a number',
      'number.min': 'partial amount must be greater than 0'
    }),
    otherwise: Joi.valid(null, "null").optional().messages({
      'any.only': 'partial amount must be null when payment status is not PARTIALLY PAID'
    }),
  }),
})

export { parcelSchema, updateParcelSchema };
