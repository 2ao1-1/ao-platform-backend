import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
// import adminRoutes from "./routes/admin.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
// app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("AO Platform Backend Running ✅");
});

export default app;
