import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { Decimal } from "@prisma/client/runtime/library";

interface AuthRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
}

// Get all market posts (auctions)
export const getMarketPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 12, category, status = "active" } = req.query;

    const where: any = {
      isInMarket: true,
    };

    // Filter by status
    if (status === "active") {
      where.auctionEndAt = { gt: new Date() };
    } else if (status === "ended") {
      where.auctionEndAt = { lt: new Date() };
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        bids: {
          orderBy: { amount: "desc" },
          take: 1,
          include: {
            bidder: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            bids: true,
          },
        },
      },
      orderBy: { auctionEndAt: "asc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const totalPosts = await prisma.post.count({ where });

    res.status(200).json({
      posts: posts.map((post) => ({
        ...post,
        currentBid: post.bids[0]?.amount || post.startingPrice,
        highestBidder: post.bids[0]?.bidder,
        timeLeft: post.auctionEndAt
          ? Math.max(0, new Date(post.auctionEndAt).getTime() - Date.now())
          : 0,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalPosts,
        pages: Math.ceil(totalPosts / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get market posts error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Move post to market
export const moveToMarket = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const { startingPrice, reservePrice, auctionDuration } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    // Validation
    if (!startingPrice || startingPrice <= 0) {
      res.status(400).json({ msg: "Valid starting price is required" });
      return;
    }

    if (!auctionDuration || auctionDuration <= 0) {
      res.status(400).json({ msg: "Valid auction duration is required" });
      return;
    }

    // Check if post exists and user owns it
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        authorId: userId,
      },
    });

    if (!post) {
      res
        .status(404)
        .json({ msg: "Post not found or you don't have permission" });
      return;
    }

    if (post.isInMarket) {
      res.status(400).json({ msg: "Post is already in market" });
      return;
    }

    // Calculate auction end time
    const auctionEndAt = new Date(
      Date.now() + auctionDuration * 60 * 60 * 1000
    );

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        isInMarket: true,
        startingPrice: new Decimal(startingPrice),
        reservePrice: reservePrice ? new Decimal(reservePrice) : null,
        auctionEndAt,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    res.status(200).json({
      message: "Post moved to market successfully",
      post: updatedPost,
    });
  } catch (error) {
    console.error("Move to market error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Place bid
export const placeBid = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const { amount } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!amount || amount <= 0) {
      res.status(400).json({ msg: "Valid bid amount is required" });
      return;
    }

    // Get post with current highest bid
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: { id: true },
        },
        bids: {
          orderBy: { amount: "desc" },
          take: 1,
        },
      },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    if (!post.isInMarket) {
      res.status(400).json({ msg: "Post is not in market" });
      return;
    }

    if (post.authorId === userId) {
      res.status(400).json({ msg: "Cannot bid on your own post" });
      return;
    }

    // Check if auction is still active
    if (post.auctionEndAt && new Date() > post.auctionEndAt) {
      res.status(400).json({ msg: "Auction has ended" });
      return;
    }

    // Check if bid is higher than current highest bid
    const currentHighestBid = post.bids[0]?.amount || post.startingPrice;
    if (new Decimal(amount).lte(currentHighestBid || 0)) {
      res.status(400).json({
        msg: `Bid must be higher than current highest bid of $${currentHighestBid}`,
      });
      return;
    }

    // Check if user already has a bid (update vs create)
    const existingBid = await prisma.bid.findFirst({
      where: {
        postId,
        bidderId: userId,
      },
    });

    let bid;
    if (existingBid) {
      // Update existing bid
      bid = await prisma.bid.update({
        where: { id: existingBid.id },
        data: { amount: new Decimal(amount) },
        include: {
          bidder: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } else {
      // Create new bid
      bid = await prisma.bid.create({
        data: {
          postId,
          bidderId: userId,
          amount: new Decimal(amount),
        },
        include: {
          bidder: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    res.status(201).json({
      message: "Bid placed successfully",
      bid,
    });
  } catch (error) {
    console.error("Place bid error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get auction details
export const getAuctionDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        bids: {
          orderBy: { createdAt: "desc" },
          include: {
            bidder: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            bids: true,
          },
        },
      },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    if (!post.isInMarket) {
      res.status(400).json({ msg: "Post is not in market" });
      return;
    }

    const currentHighestBid = post.bids[0];
    const timeLeft = post.auctionEndAt
      ? Math.max(0, new Date(post.auctionEndAt).getTime() - Date.now())
      : 0;

    res.status(200).json({
      post: {
        ...post,
        currentBid: currentHighestBid?.amount || post.startingPrice,
        highestBidder: currentHighestBid?.bidder,
        timeLeft,
        isActive: timeLeft > 0,
      },
    });
  } catch (error) {
    console.error("Get auction details error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get user's bids
export const getUserBids = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10, status = "all" } = req.query;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const where: any = { bidderId: userId };

    // Filter by status
    if (status === "active") {
      where.post = { auctionEndAt: { gt: new Date() } };
    } else if (status === "ended") {
      where.post = { auctionEndAt: { lt: new Date() } };
    }

    const bids = await prisma.bid.findMany({
      where,
      include: {
        post: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            bids: {
              orderBy: { amount: "desc" },
              take: 1, // Get highest bid to compare
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const total = await prisma.bid.count({ where });

    // Check if user won each auction
    const bidsWithStatus = bids.map((bid) => {
      const isHighestBidder = bid.post.bids[0]?.bidderId === userId;
      const auctionEnded = bid.post.auctionEndAt
        ? new Date() > bid.post.auctionEndAt
        : false;

      return {
        ...bid,
        isWinning: isHighestBidder,
        hasWon: auctionEnded && isHighestBidder,
        auctionStatus: auctionEnded ? "ended" : "active",
      };
    });

    res.status(200).json({
      bids: bidsWithStatus,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get user bids error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Remove from market (seller only)
export const removeFromMarket = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        authorId: userId,
      },
      include: {
        _count: {
          select: { bids: true },
        },
      },
    });

    if (!post) {
      res
        .status(404)
        .json({ msg: "Post not found or you don't have permission" });
      return;
    }

    if (!post.isInMarket) {
      res.status(400).json({ msg: "Post is not in market" });
      return;
    }

    // Check if there are any bids
    if (post._count.bids > 0) {
      res
        .status(400)
        .json({ msg: "Cannot remove post from market with existing bids" });
      return;
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        isInMarket: false,
        startingPrice: null,
        reservePrice: null,
        auctionEndAt: null,
      },
    });

    res.status(200).json({
      message: "Post removed from market successfully",
      post: updatedPost,
    });
  } catch (error) {
    console.error("Remove from market error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get market statistics
export const getMarketStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const activeAuctions = await prisma.post.count({
      where: {
        isInMarket: true,
        auctionEndAt: { gt: new Date() },
      },
    });

    const endedAuctions = await prisma.post.count({
      where: {
        isInMarket: true,
        auctionEndAt: { lt: new Date() },
      },
    });

    const totalBids = await prisma.bid.count();

    // Get highest selling artwork (completed auction with highest bid)
    const highestSale = await prisma.post.findFirst({
      where: {
        isInMarket: true,
        auctionEndAt: { lt: new Date() },
      },
      include: {
        bids: {
          orderBy: { amount: "desc" },
          take: 1,
        },
        author: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        bids: {
          _count: "desc",
        },
      },
    });

    res.status(200).json({
      activeAuctions,
      endedAuctions,
      totalBids,
      highestSale: highestSale
        ? {
            ...highestSale,
            finalPrice: highestSale.bids[0]?.amount || 0,
          }
        : null,
    });
  } catch (error) {
    console.error("Get market stats error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};
