import jwt from "jsonwebtoken";

const generateAccessToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const generateRefreshToken = (user) => {
  const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN, 
  });

  return refreshToken;
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export { 
  generateAccessToken,
  generateRefreshToken,
  generateOTP
}