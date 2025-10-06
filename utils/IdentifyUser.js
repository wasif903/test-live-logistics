import AdminModel from "../models/AdminSchema.js";
import AgencyModel from "../models/AgencySchema.js";
import OperatorModel from "../models/OperatorSchema.js";
import UserModel from "../models/UserSchema.js";

/**
 * Identify a user by ID and allowed types.
 * @param {string|ObjectId} id - The user ID to search for.
 * @param {string[]} types - Array of types to search (e.g., ['Admin', 'Agency'])
 * @returns {Promise<{user: object, type: string}|null>} The user and type if found, else null.
 */
export async function identifyUserByType(id, types = []) {
  for (const type of types) {
    if (type === "Admin") {
      const user = await AdminModel.findById(id);
      if (user) return { user, type: "Admin" };
    }
    if (type === "Agency") {
      const user = await AgencyModel.findById(id);
      if (user) return { user, type: "Agency" };
    }
    if (type === "Operator") {
      const user = await OperatorModel.findById(id);
      if (user) return { user, type: "Operator" };
    }
    if (type === "User") {
      const user = await UserModel.findById(id);
      if (user) return { user, type: "User" };
    }
  }
  return null;
} 