import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@/utils/prisma";
import { generateToken } from "@/utils/token";
import dotenv from "dotenv";

dotenv.config();

// login admin
export const loginAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Check data
    if (!email || !password) {
      res.status(400).json({ msg: "Email and password are required" });
      return;
    }

    // Search of admin in database
    const admin = await prisma.user.findUnique({
      where: { email },
    });

    if (!admin) {
      res.status(401).json({ msg: "Invalid admin credentials" });
      return;
    }

    // Check Admin is the admin
    if (!admin.isAdmin) {
      res.status(403).json({ msg: "Access denied. Admin only." });
      return;
    }

    // Check password
    if (!admin.password) {
      res.status(401).json({ msg: "Invalid admin credentials" });
      return;
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      res.status(401).json({ msg: "Invalid admin credentials" });
      return;
    }

    // Create token
    const token = generateToken(admin.id, true);

    // Response
    res.status(200).json({
      message: "Admin login successful",
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        isAdmin: admin.isAdmin,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Admin seeding
export const createAdminUser = async (): Promise<void> => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set."
      );
    }

    // if the admin existing
    const existingAdmin = await prisma.user.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      console.log("✅ Admin already exists");
      return;
    }

    // Encryption password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create Admin
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: "Admin",
        lastName: "Master",
        isAdmin: true,
      },
    });

    console.log("✅ Admin created successfully");
  } catch (error) {
    console.error("❌ Error creating admin:", error);
    throw error;
  }
};

export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: search as string, mode: "insensitive" } },
          { lastName: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isAdmin: true,
        isBanned: true,
        isVerified: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            bids: true,
            followers: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const total = await prisma.user.count({
      where: {
        OR: [
          { firstName: { contains: search as string, mode: "insensitive" } },
          { lastName: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ],
      },
    });

    res.status(200).json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// un/banning user
export const toggleUserBan = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true, isAdmin: true, email: true },
    });

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    // ban user by admin
    if (user.isAdmin) {
      res.status(403).json({ msg: "Cannot ban admin users" });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: !user.isBanned },
      select: {
        id: true,
        email: true,
        isBanned: true,
      },
    });

    res.status(200).json({
      message: `User ${
        updatedUser.isBanned ? "banned" : "unbanned"
      } successfully`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Toggle ban error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// stats
export const getSystemStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const [
      totalUsers,
      totalPosts,
      totalBids,
      bannedUsers,
      postsInMarket,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.bid.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.post.count({ where: { isInMarket: true } }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last week
          },
        },
      }),
    ]);

    res.status(200).json({
      stats: {
        totalUsers,
        totalPosts,
        totalBids,
        bannedUsers,
        postsInMarket,
        recentUsers,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};
