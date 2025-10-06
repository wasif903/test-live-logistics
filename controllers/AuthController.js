import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import {
  generateAccessToken,
  generateRefreshToken,
  generateOTP,
} from "../utils/TokenGenerator.js";
import AdminModel from "../models/AdminSchema.js";
import UserModel from "../models/UserSchema.js";
import AgencyModel from "../models/AgencySchema.js";
import OperatorModel from "../models/OperatorSchema.js";
import autoMailer from "../utils/AutoMailer.js";
import mongoose from "mongoose";
import { HandleUpdateAdmin, HandleUpdateAgency, HandleUpdateOperator, HandleUpdateUser } from "../helpers/UpdateProfileHelper.js";

// REGISTER
// METHOD : POST
// ENDPOINT: /api/register
const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const existingUser =
      (await AdminModel.findOne({
        $or: [{ username }, { email }],
      })) ||
      (await UserModel.findOne({
        $or: [{ username }, { email }],
      })) ||
      (await AgencyModel.findOne({
        $or: [{ username }, { email }],
      }));
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new AdminModel({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    newUser.refreshToken = refreshToken;
    await newUser.save();

    const userDetails = {
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      _id: newUser._id,
    };

    // Return tokens
    res.status(201).json({
      message: "User registered successfully",
      accessToken,
      refreshToken,
      user: userDetails,
    });
  } catch (err) {
    next(err);
  }
};

// LOGIN
// METHOD : POST
// ENDPOINT: /api/login
const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    const user =
      (await AdminModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await UserModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await AgencyModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await OperatorModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      }));

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    let details;

    if (user.role.includes("Admin")) {
      details = {
        username: user.username,
        email: user.email,
        role: user.role,
        _id: user._id,
        createdAt: user.createdAt,
      };
    } else if (user.role.includes("Agency")) {
      details = {
        username: user.username,
        agencyName: user.agencyName,
        companyCode: user.companyCode,
        email: user.email,
        role: user.role,
        _id: user._id,
        createdAt: user.createdAt,
      };
    } else if (user.role.includes("Operator")) {
      details = {
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        agencyID: user.agencyID,
        officeID: user.officeID,
        status: user.status,
        _id: user._id,
        createdAt: user.createdAt,
      };
    } else {
      details = {
        username: user.username,
        email: user.email,
        country: user.country,
        countryCode: user.countryCode,
        phone: user.phone,
        role: user.role,
        _id: user._id,
        createdAt: user.createdAt,
      };
    }

    res.status(200).json({ accessToken, refreshToken, user: details });
  } catch (err) {
    next(err);
  }
};

// REFRESH
// METHOD : POST
// ENDPOINT: /api/refresh
const refreshToken = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(403).json({ message: "Refresh token is required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user =
      (await AdminModel.findById(decoded.id)) ||
      (await UserModel.findById(decoded.id));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.refreshToken !== token) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const accessToken = generateAccessToken(user);

    res.status(200).json({ accessToken });
  } catch (err) {
    res.status(403).json({ message: "Invalid refresh token" });
  }
};

// LOGOUT (Invalidate refresh token)
// METHOD : POST
// ENDPOINT: /api/logout
const logout = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Refresh token is required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user =
      (await AdminModel.findById(decoded.id)) ||
      (await OperatorModel.findById(decoded.id)) ||
      (await AgencyModel.findById(decoded.id)) ||
      (await UserModel.findById(decoded.id));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.refreshToken = null;
    await user.save();

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(403).json({ message: "Invalid refresh token" });
  }
};

// FORGET PASSWORD
// METHOD: POST
// ENDPOINT: /api/forget-password
const forgetPassword = async (req, res, next) => {
  try {
    const { identifier } = req.body;
    const user =
      (await AdminModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await UserModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await AgencyModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await OperatorModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      }));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.otp = otp;
    user.otpExpire = otpExpire;
    await user.save();

    autoMailer({
      to: user.email,
      subject: "Password Reset OTP",
      message: `<p>Your OTP for password reset is: <b>${otp}</b>. It will expire in 10 minutes.</p>`,
    });

    res.status(200).json({ message: "OTP sent to your email.", identifier });
  } catch (err) {
    next(err);
  }
};

// VERIFY OTP
// METHOD: POST
// ENDPOINT: /api/verify-otp
const verifyOtp = async (req, res, next) => {
  try {
    const { identifier, otp } = req.body;
    const user =
      (await AdminModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await UserModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await AgencyModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await OperatorModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      }));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.otp || !user.otpExpire) {
      return res.status(400).json({ message: "No OTP requested." });
    }
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }
    if (user.otpExpire < new Date()) {
      return res.status(400).json({ message: "OTP expired." });
    }
    res.status(200).json({ message: "OTP verified.", identifier, otp });
  } catch (err) {
    next(err);
  }
};

// CHANGE PASSWORD
// METHOD: POST
// ENDPOINT: /api/change-password
const changePassword = async (req, res, next) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    const user =
      (await AdminModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await UserModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await AgencyModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })) ||
      (await OperatorModel.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      }));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.otp || !user.otpExpire) {
      return res.status(400).json({ message: "No OTP requested." });
    }
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }
    if (user.otpExpire < new Date()) {
      return res.status(400).json({ message: "OTP expired." });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = null;
    user.otpExpire = null;
    await user.save();
    res.status(200).json({ message: "Password changed successfully." });
  } catch (err) {
    next(err);
  }
};


// GET PROFILE
// METHOD: GET
// ENDPOINT: /api/profile/:id
const HandleGetProfile = async (req, res, next) => {
  try {

    const { id } = req.params;

    const user =
      (await AdminModel.findById(id)) ||
      (await UserModel.findById(id)) ||
      (await AgencyModel.findById(id)) ||
      (await OperatorModel.findById(id));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role.includes("Agency")) {

      return res.status(200).json({ profile: user })


    } else if (user.role.includes("Operator")) {

      const pipeline = [{
        $match: {
          _id: new mongoose.Types.ObjectId(id)
        },
      }, {
        $lookup: {
          from: "offices",
          localField: "officeID",
          foreignField: "_id",
          as: "officeDetails",
        },
      },
      {
        $unwind: "$officeDetails"
      },
      {
        $lookup: {
          from: "agencies",
          localField: "agencyID",
          foreignField: "_id",
          as: "agencyDetails",
        },
      },
      {
        $unwind: "$agencyDetails"
      },
      {
        $project: {
          _id: 1,
          username: 1,
          email: 1,
          phone: 1,
          role: 1,
          status: 1,
          agency: {
            agencyID: "$agencyDetails._id",
            agencyName: "$agencyDetails.agencyName",
            companyCode: "$agencyDetails.companyCode",
          },
          office: {
            officeID: "$officeDetails._id",
            officeName: "$officeDetails.officeName",
            address: "$officeDetails.address",
          }
        }
      }]
      const user = await OperatorModel.aggregate(pipeline);

      return res.status(200).json({ profile: user })

    } else if (user.role.includes("Admin")) {

      return res.status(200).json({ profile: user })

    } else {
      res.status(400).json({ message: "Invalid Role" })
    }

  } catch (error) {
    console.log(error)
    next(error)
  }
}


// UPDATE PROFILE
// METHOD: PATCH
// ENDPOINT: /api/update-user/:id
const HandleUpdateProfile = async (req, res, next) => {
  try {

    const { id } = req.params;

    const user =
      (await AdminModel.findById(id)) ||
      (await UserModel.findById(id)) ||
      (await AgencyModel.findById(id)) ||
      (await OperatorModel.findById(id));


    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role.includes("Agency")) {
      return HandleUpdateAgency(req, res, next, user)
    } else if (user.role.includes("Operator")) {
      return HandleUpdateOperator(req, res, next, user)
    } else if (user.role.includes("Admin")) {
      return HandleUpdateAdmin(req, res, next, user)
    } else if (user.role.includes("User")) {
      return HandleUpdateUser(req, res, next, user)
    } else {
      return res.status(400).json({ message: "Bad Request" });
    }

  } catch (error) {
    next(error);
  }
}

export {
  register,
  login,
  logout,
  refreshToken,
  forgetPassword,
  verifyOtp,
  changePassword,
  HandleGetProfile,
  HandleUpdateProfile
};
