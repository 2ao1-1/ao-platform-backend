import express from "express";
import {
  getFeed,
  createPost,
  getPost,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
} from "../controllers/posts.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/feed", getFeed);
router.get("/:postId", getPost);

// Protected routes
router.use(verifyToken);

router.post("/", createPost);
router.put("/:postId", updatePost);
router.delete("/:postId", deletePost);
router.post("/:postId/like", toggleLike);
router.post("/:postId/comment", addComment);

export default router;
