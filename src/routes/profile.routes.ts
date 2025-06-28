import express from "express";
import {
  getProfile,
  updateProfile,
  getUserPosts,
  toggleFollow,
  getFollowers,
  getFollowing,
  changePassword,
  deleteAccount,
} from "../controllers/profile.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/:userId", getProfile); // Get any user's profile
router.get("/:userId/posts", getUserPosts); // Get user's posts
router.get("/:userId/followers", getFollowers); // Get user's followers
router.get("/:userId/following", getFollowing); // Get user's following

// Protected routes
router.use(verifyToken);

// Get current user's profile
router.get("/", getProfile);

// Update profile
router.put("/", updateProfile);

// Follow/Unfollow user
router.post("/:userId/follow", toggleFollow);

// Change password
router.put("/password", changePassword);

// Delete account
router.delete("/", deleteAccount);

export default router;
