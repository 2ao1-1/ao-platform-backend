import express from "express";
import {
  loginAdmin,
  getAllUsers,
  toggleUserBan,
  getSystemStats,
} from "../controllers/admin.controller";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware";

const router = express.Router();

// Login (without authentication)
router.post("/login", loginAdmin);

// Protected Admin Routes
router.use(verifyToken, verifyAdmin);

router.get("/users", getAllUsers);
router.patch("/users/:userId/ban", toggleUserBan);
router.get("/stats", getSystemStats);

export default router;
