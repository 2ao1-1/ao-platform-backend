import express from "express";
import {
  getMarketPosts,
  moveToMarket,
  placeBid,
  getAuctionDetails,
  getUserBids,
  removeFromMarket,
  getMarketStats,
} from "../controllers/market.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", getMarketPosts);
router.get("/stats", getMarketStats);
router.get("/auction/:postId", getAuctionDetails);

// Protected routes
router.use(verifyToken);

router.post("/:postId/move-to-market", moveToMarket);
router.post("/:postId/bid", placeBid);
router.delete("/:postId/remove-from-market", removeFromMarket);
router.get("/my-bids", getUserBids);

export default router;
