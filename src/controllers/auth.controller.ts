import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/utils/prisma";
import { generateToken } from "@/utils/token";

// register
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // 1- check email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ msg: "Email already in use" });
    }

    // 2- encoded password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3- create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
      },
    });

    // 4- token
    const token = generateToken(user.id, false);

    // 5- respose
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        // isAdmin property removed as it does not exist on user
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      res.status(403).json({ msg: "Invalid credentials" });
      return;
    }

    // if (user.isBanned) {
    //   res.status(403).json({ msg: "Account is banned" });
    //   return;
    // }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ msg: "Invalid credentials" });
      return;
    }

    const token = generateToken(user.id, false);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    res.status(500).json({ msg: "Internal server error" });
  }
};
