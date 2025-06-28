import { Request, Response } from "express";
import { prisma } from "@/utils/prisma";
import bcrypt from "bcryptjs";

interface AuthRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
}

// Get user profile
export const getProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { userId: profileUserId } = req.params;

    // If no userId in params, get current user's profile
    const targetUserId = profileUserId || userId;

    if (!targetUserId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        phone: true,
        socialLinks: true,
        isVerified: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    // Check if current user is following this profile (if different users)
    let isFollowing = false;
    if (userId && userId !== targetUserId) {
      const followRelation = await prisma.follow.findFirst({
        where: {
          followerId: userId,
          followingId: targetUserId,
        },
      });
      isFollowing = !!followRelation;
    }

    res.status(200).json({
      user: {
        ...user,
        isFollowing,
        isOwnProfile: userId === targetUserId,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Update profile
export const updateProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { firstName, lastName, bio, phone, socialLinks } = req.body;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        bio: bio || undefined,
        phone: phone || undefined,
        socialLinks: socialLinks || undefined,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        phone: true,
        socialLinks: true,
        isVerified: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get user posts
export const getUserPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 12, type = "all" } = req.query;

    if (!userId) {
      res.status(400).json({ msg: "User ID is required" });
      return;
    }

    let where: any = { authorId: userId };

    // Filter by post type
    if (type === "market") {
      where.isInMarket = true;
    } else if (type === "posts") {
      where.isInMarket = false;
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
        _count: {
          select: {
            likes: true,
            comments: true,
            bids: true,
          },
        },
        bids: {
          orderBy: { amount: "desc" },
          take: 1, // Get highest bid
          include: {
            bidder: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const totalPosts = await prisma.post.count({ where });

    res.status(200).json({
      posts: posts.map((post) => ({
        ...post,
        highestBid: post.bids[0] || null,
        bids: undefined, // Remove bids array, keep only highest bid
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalPosts,
        pages: Math.ceil(totalPosts / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get user posts error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Follow/Unfollow user
export const toggleFollow = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (userId === targetUserId) {
      res.status(400).json({ msg: "You cannot follow yourself" });
      return;
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    // Check if already following
    const existingFollow = await prisma.follow.findFirst({
      where: {
        followerId: userId,
        followingId: targetUserId,
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: { id: existingFollow.id },
      });
      res.status(200).json({
        message: "User unfollowed successfully",
        isFollowing: false,
      });
    } else {
      // Follow
      await prisma.follow.create({
        data: {
          followerId: userId,
          followingId: targetUserId,
        },
      });
      res.status(200).json({
        message: "User followed successfully",
        isFollowing: true,
      });
    }
  } catch (error) {
    console.error("Toggle follow error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get followers
export const getFollowers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const followers = await prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            bio: true,
            isVerified: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const totalFollowers = await prisma.follow.count({
      where: { followingId: userId },
    });

    res.status(200).json({
      followers: followers.map((f) => f.follower),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalFollowers,
        pages: Math.ceil(totalFollowers / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get followers error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get following
export const getFollowing = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            bio: true,
            isVerified: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const totalFollowing = await prisma.follow.count({
      where: { followerId: userId },
    });

    res.status(200).json({
      following: following.map((f) => f.following),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalFollowing,
        pages: Math.ceil(totalFollowing / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Change password
export const changePassword = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({ msg: "Current and new passwords are required" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ msg: "Password must be at least 6 characters" });
      return;
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      res.status(400).json({ msg: "Cannot change password for this account" });
      return;
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isValidPassword) {
      res.status(400).json({ msg: "Current password is incorrect" });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Delete account
export const deleteAccount = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { password } = req.body;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!password) {
      res.status(400).json({ msg: "Password is required to delete account" });
      return;
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      res.status(400).json({ msg: "Cannot delete this account" });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(400).json({ msg: "Incorrect password" });
      return;
    }

    // Delete user and all related data
    await prisma.$transaction([
      // Delete user's likes
      prisma.like.deleteMany({ where: { userId } }),
      // Delete user's comments
      prisma.comment.deleteMany({ where: { authorId: userId } }),
      // Delete user's bids
      prisma.bid.deleteMany({ where: { bidderId: userId } }),
      // Delete follow relationships
      prisma.follow.deleteMany({
        where: {
          OR: [{ followerId: userId }, { followingId: userId }],
        },
      }),
      // Delete user's posts (and their likes, comments, bids will cascade)
      prisma.post.deleteMany({ where: { authorId: userId } }),
      // Finally delete the user
      prisma.user.delete({ where: { id: userId } }),
    ]);

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};
