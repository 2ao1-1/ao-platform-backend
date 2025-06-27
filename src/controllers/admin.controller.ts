import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import { generateToken } from "../utils/token";

export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isAdmin)
      return res.status(403).json({ msg: "Not an admin" });

    const isMatch = await bcrypt.compare(password, user.password!);
    if (!isMatch) return res.status(401).json({ msg: "Invalid credentials" });

    const token = generateToken(user.id, user.isAdmin);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    res.status(500).json({ msg: "Internal server error" });
  }
};
