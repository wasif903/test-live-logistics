const AccessMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user || !allowedRoles.includes(user.role[0])) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: insufficient permissions',
      });
    }

    next();
  };
};


export default AccessMiddleware