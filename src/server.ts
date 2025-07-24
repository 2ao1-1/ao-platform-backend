import app from "./app";
import dotenv from "dotenv";
import { createAdminUser } from "./controllers/admin.controller";

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await createAdminUser();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.log("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
