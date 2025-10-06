import multer from "multer";
import path from "path";
import fs from "fs";

// Max file size: 1MB
const MAX_SIZE = 1 * 1024 * 1024;

// Upload destination base path
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Ensure directory exists
const ensureUploadPath = () => {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
};

// Multer storage config for disk
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        ensureUploadPath();
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
        cb(null, uniqueName);
    }
});

// Validate only PNG/JPG
const fileFilter = (req, file, cb) => {
    const allowedExts = ['.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("Only .png, .jpg and .jpeg formats are allowed."));
    }
};

// Factory middleware for dynamic field
const CreateUploadMiddleware = (fields) => {
    const upload = multer({
        storage,
        limits: {
            fileSize: MAX_SIZE,
            files: 5, // total max files across all fields
        },
        fileFilter,
    });

    // Convert to multer's expected format for `upload.fields()`
    const formattedFields = fields.map(field => ({
        name: field.name,
        maxCount: field.isMultiple ? 5 : 1,
    }));

    const handler = upload.fields(formattedFields);

    return (req, res, next) => {
        handler(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(400).json({ error: "File too large. Max size is 1MB." });
                }
                if (err.code === "LIMIT_UNEXPECTED_FILE") {
                    return res.status(400).json({ error: "Too many files uploaded." });
                }
                return res.status(400).json({ error: err.message });
            } else if (err) {
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    };
};

export { CreateUploadMiddleware };
