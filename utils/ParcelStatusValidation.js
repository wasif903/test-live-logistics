/**
 * Parcel Status Validation Utility
 * Validates if a parcel status can be set/updated based on payment status
 */

// Parcel statuses that require payment validation
const STATUSES_REQUIRING_PAYMENT_VALIDATION = [
  "IN TRANSIT",
  "ARRIVED AT DESTINATION OFFICE", 
  "WAITING FOR WITHDRAWAL",
  "DELIVERED/PICKED UP",
  "UNCLAIMED PACKAGE"
];

// Payment statuses that allow advanced parcel statuses
const VALID_PAYMENT_STATUSES = [
  "PAYMENT VALIDATED",
  "DEFERRED PAYMENT"
];

/**
 * Validates if a parcel status can be set based on payment status
 * @param {string} parcelStatus - The parcel status to validate
 * @param {string} paymentStatus - The current payment status
 * @returns {Object} - Validation result with isValid boolean and error message
 */
export const validateParcelStatusByPayment = (parcelStatus, paymentStatus) => {
  // If the status doesn't require payment validation, it's always valid
  if (!STATUSES_REQUIRING_PAYMENT_VALIDATION.includes(parcelStatus)) {
    return {
      isValid: true,
      errorMessage: null
    };
  }

  // If the status requires payment validation, check if payment is validated or deferred
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    return {
      isValid: false,
      errorMessage: `Cannot set parcel status to "${parcelStatus}" until payment is validated. Current payment status: "${paymentStatus}". Payment must be "PAYMENT VALIDATED" or "DEFERRED PAYMENT" to proceed.`
    };
  }

  return {
    isValid: true,
    errorMessage: null
  };
};

/**
 * Gets all parcel statuses that require payment validation
 * @returns {Array} - Array of status strings
 */
export const getStatusesRequiringPaymentValidation = () => {
  return [...STATUSES_REQUIRING_PAYMENT_VALIDATION];
};

/**
 * Gets all valid payment statuses for advanced parcel statuses
 * @returns {Array} - Array of payment status strings
 */
export const getValidPaymentStatuses = () => {
  return [...VALID_PAYMENT_STATUSES];
};

/**
 * Checks if a specific parcel status requires payment validation
 * @param {string} parcelStatus - The parcel status to check
 * @returns {boolean} - True if payment validation is required
 */
export const requiresPaymentValidation = (parcelStatus) => {
  return STATUSES_REQUIRING_PAYMENT_VALIDATION.includes(parcelStatus);
}; 