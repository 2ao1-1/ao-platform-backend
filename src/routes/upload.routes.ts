import express from "express";
import {
  uploadImage,
  deleteImage,
  uploadAvatar,
  getOptimizedImageUrl,
  singleUpload,
  avatarUpload,
  multipleUpload,
} from "../controllers/upload.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes (for getting optimized images)
router.get("/optimize", getOptimizedImageUrl);

// All upload routes require authentication
router.use(verifyToken);

// Upload image for posts
router.post("/image", singleUpload, uploadImage);

// Upload multiple images (for future use)
router.post("/images", multipleUpload, (req, res) => {
  // This is a placeholder for multiple image upload
  res.status(200).json({ message: "Multiple upload endpoint ready" });
});

// Upload avatar
router.post("/avatar", avatarUpload, uploadAvatar);

// Delete image
router.delete("/image/:imageKey", deleteImage);

export default router;
