// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import mongoose from "mongoose";

// // Middlewares
// import ErrorHandler from "./middlewares/ErrorHandler.js";
// import ErrorLogger from "./middlewares/ErrorLogger.js";
// import RateLimiter from "./middlewares/RateLimiter.js";
// import SecurityHeaders from "./middlewares/HelmetMiddleware.js";

// // DB Connection
// import connectDB from "./config/DB.js";


// // Routes
// import AuthRoutes from "./routes/AuthRoutes.js";
// import AgencyRoutes from "./routes/AgencyRoutes.js";
// import OfficeRoutes from "./routes/OfficeRoutes.js";
// import TagsRoutes from "./routes/TagsRoutes.js";
// import InvitationRoutes from "./routes/InvitationRoutes.js";
// import OperatorRoutes from "./routes/OperatorRoutes.js";
// import ParcelRoutes from "./routes/ParcelRoutes.js";
// import UserRoutes from "./routes/UserRoutes.js";
// import ContactRoutes from "./routes/ContactRoutes.js";
// import SupportRoutes from "./routes/SupportRoutes.js";
// import DashboardRoutes from "./routes/DashboardRoutes.js";
// import { allowedOrigins } from "./utils/AllowedOrigins.js";

// dotenv.config();

// const app = express();

// app.use(SecurityHeaders);

// // === MongoDB Connection ===
// connectDB();

// // === Global Middlewares ===
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.use(
//   cors({
//     origin: allowedOrigins,
//     credentials: true,
//     methods: ["POST", "GET", "PATCH", "DELETE"],
//   })
// );

// // === Security Header Middleware ===
// app.use(
//   "/uploads",
//   (req, res, next) => {
//     const origin = req.headers.origin;
//     if (allowedOrigins.includes(origin)) {
//       res.header("Access-Control-Allow-Origin", origin);
//     }
//     res.header("Access-Control-Allow-Methods", "GET");
//     res.header(
//       "Access-Control-Allow-Headers",
//       "Origin, X-Requested-With, Content-Type, Accept"
//     );
//     next();
//   },
//   express.static("uploads")
// );

// // === Rate Limiter
// app.use(RateLimiter);

// // === Logger Middleware for logging errors
// app.use(ErrorLogger);


// app.get("/", (req, res) => {
//   res.status(200).json({ message: "OK!" })
// })

// // === Routes ===
// app.use("/api", AuthRoutes);
// app.use("/api", DashboardRoutes);
// app.use("/api/agency", AgencyRoutes);
// app.use("/api/office", OfficeRoutes);
// app.use("/api/user", UserRoutes);
// app.use("/api/tags", TagsRoutes);
// app.use("/api/invite", InvitationRoutes);
// app.use("/api/parcel", ParcelRoutes);
// app.use("/api/operator", OperatorRoutes);
// app.use("/api/support", SupportRoutes);
// app.use("/api", ContactRoutes);

// // === Error Handler
// app.use(ErrorHandler);

// // === Server Start ===
// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });



import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import ngrok from "ngrok"; // <--- added

// Middlewares
import ErrorHandler from "./middlewares/ErrorHandler.js";
import ErrorLogger from "./middlewares/ErrorLogger.js";
import RateLimiter from "./middlewares/RateLimiter.js";
import SecurityHeaders from "./middlewares/HelmetMiddleware.js";

// DB Connection
import connectDB from "./config/DB.js";

// Routes
import AuthRoutes from "./routes/AuthRoutes.js";
import AgencyRoutes from "./routes/AgencyRoutes.js";
import OfficeRoutes from "./routes/OfficeRoutes.js";
import TagsRoutes from "./routes/TagsRoutes.js";
import InvitationRoutes from "./routes/InvitationRoutes.js";
import OperatorRoutes from "./routes/OperatorRoutes.js";
import ParcelRoutes from "./routes/ParcelRoutes.js";
import UserRoutes from "./routes/UserRoutes.js";
import ContactRoutes from "./routes/ContactRoutes.js";
import SupportRoutes from "./routes/SupportRoutes.js";
import DashboardRoutes from "./routes/DashboardRoutes.js";
import { allowedOrigins } from "./utils/AllowedOrigins.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

app.use(SecurityHeaders);



// === MongoDB Connection ===
connectDB();

// === Global Middlewares ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["POST", "GET", "PATCH", "DELETE"],
  })
);

// === Static Uploads Middleware ===
app.use(
  "/uploads",
  (req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  },
  express.static("uploads")
);

// === Rate Limiter
app.use(RateLimiter);

// === Logger Middleware
app.use(ErrorLogger);

app.get("/", (req, res) => {
  res.status(200).json({ message: "OK!" });
});

// === Routes ===
app.use("/api", AuthRoutes);
app.use("/api", DashboardRoutes);
app.use("/api/agency", AgencyRoutes);
app.use("/api/office", OfficeRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/tags", TagsRoutes);
app.use("/api/invite", InvitationRoutes);
app.use("/api/parcel", ParcelRoutes);
app.use("/api/operator", OperatorRoutes);
app.use("/api/support", SupportRoutes);
app.use("/api", ContactRoutes);

// === Error Handler
app.use(ErrorHandler);

// === Server Start ===
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);

  if (process.env.NODE_ENV !== "production") {
    try {
      const url = await ngrok.connect({
        addr: PORT,
        authtoken: process.env.NGROK_AUTH_TOKEN, // optional if configured globally
      });
      console.log(`🌍 Ngrok tunnel: ${url}`);
    } catch (err) {
      console.error("❌ Error starting ngrok:", err);
    }
  }
});
