import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";

interface AuthRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
}

// Token Verify
export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      res.status(401).json({ msg: "No token provided" });
      return;
    }

    if (!process.env.JWT_SECRET) {
      res.status(500).json({ msg: "JWT secret not configured" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      id: string;
      isAdmin: boolean;
    };

    // Check if user existing
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, isAdmin: true, isBanned: true },
    });

    if (!user) {
      res.status(401).json({ msg: "User not found" });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({ msg: "Account is banned" });
      return;
    }

    req.user = {
      id: user.id,
      isAdmin: user.isAdmin,
    };

    next();
  } catch (error) {
    res.status(401).json({ msg: "Invalid token" });
  }
};

// Admin Verify
export const verifyAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ msg: "Admin only" });
    return;
  }
  next();
};
