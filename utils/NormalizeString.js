const normalizeString = (value) => {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
};

const normalizeFields = (obj, fields) => {
  const normalized = { ...obj };
  for (const field of fields) {
    normalized[field] = normalizeString(obj[field]);
  }
  return normalized;
};

export { normalizeString, normalizeFields };
