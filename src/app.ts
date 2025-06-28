import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";

const app = express();

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("AO Platform Backend Running ✅");
});

export default app;
