import express from "express";
import { loginAdmin } from "../controllers/admin.controller";

const router = express.Router();

router.post("/login", loginAdmin);

export default router;
