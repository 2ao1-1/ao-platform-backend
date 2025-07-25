import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import postsRoutes from "./routes/posts.routes";
import uploadRoutes from "./routes/upload.routes";

import profileRoutes from "./routes/profile.routes";
import marketRoutes from "./routes/market.routes";

const app = express();

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/upload", uploadRoutes);

app.use("/api/profile", profileRoutes);
app.use("/api/market", marketRoutes);

app.get("/", (req, res) => {
  res.send("AO Platform Backend Running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  });
});

export default app;
