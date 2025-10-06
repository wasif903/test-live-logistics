// middleware/validate.js
const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                status: "error",
                message: "Validation error",
                details: error.details.map(detail => detail.message),
            });
        }
        next();
    };
};

export default validate;
