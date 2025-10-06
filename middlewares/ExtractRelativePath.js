// utils/extractRelativeFilePath.js
import path from "path";

/**
 * Extracts a relative file path from a Multer file object
 * @param {Object} file - Multer file object (from req.files or req.file)
 * @returns {string|null} Relative path (e.g., uploads/parcels/pictures/file.jpg) or null if invalid
 */
const ExtractRelativeFilePath = (file) => {
  if (!file || !file.path || !file.filename) return null;

  const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');
  return relativePath;
};

export default ExtractRelativeFilePath;
