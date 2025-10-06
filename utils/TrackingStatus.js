const parcelStatus = [
  {
    STATUS: "RECEIVED IN WAREHOUSE",
    MESSAGE:
      "The package has arrived at the agency and been registered in the system.",
  },
  {
    STATUS: "WAITING TO BE GROUPED",
    MESSAGE: "The package is waiting to be combined with others for shipping.",
  },
  {
    STATUS: "READY FOR SHIPMENT",
    MESSAGE: "The package is packed, labeled, ready to ship.",
  },
  {
    STATUS: "SHIPPED",
    MESSAGE: "The parcel has left the agency and is on its way.",
  },
  {
    STATUS: "IN TRANSIT",
    MESSAGE: "The package is currently in transit to the destination.",
  },
  {
    STATUS: "ARRIVED AT DESTINATION OFFICE",
    MESSAGE:
      "The package has arrived safely in the designated country or city.",
  },
  {
    STATUS: "WAITING FOR WITHDRAWAL",
    MESSAGE: "The package is available, the customer can come and pick it up.",
  },
  {
    STATUS: "DELIVERED/PICKED UP",
    MESSAGE: "The package has been delivered to the customer.",
  },
  {
    STATUS: "UNCLAIMED PACKAGE",
    MESSAGE: "The parcel has not been picked up within the deadline.",
  },
];

const transactionStatus = [
  {
    STATUS: "PENDING PAYMENT",
    MESSAGE: "The customer has not yet paid the amount due.",
  },
  {
    STATUS: "PARTIALLY PAID",
    MESSAGE: "Part of the amount has been paid; the remaining balance is due.",
  },
  {
    STATUS: "DEFERRED PAYMENT",
    MESSAGE:
      "The customer is authorized to pay later (upon delivery or at the agreed deadline).",
  },
  {
    STATUS: "PAYMENT VALIDATED",
    MESSAGE: "The full amount has been paid and validated by the team.",
  },
  {
    STATUS: "PAYMENT FAILED",
    MESSAGE: "The payment attempt failed (bank error, card declined, etc.).",
  },
  {
    STATUS: "PAYMENT CANCELLED",
    MESSAGE:
      "The payment was canceled following an order or shipment cancellation.",
  },
];

function getParcelStatusMessage(status) {
  const found = parcelStatus.find((item) => item.STATUS === status);
  return found ? found.MESSAGE : null;
}

function getTransactionStatusMessage(status) {
  const found = transactionStatus.find((item) => item.STATUS === status);
  return found ? found.MESSAGE : null;
}

export {
  parcelStatus,
  transactionStatus,
  getParcelStatusMessage,
  getTransactionStatusMessage,
};
