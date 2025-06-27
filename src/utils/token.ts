import jwt from "jsonwebtoken";

export const generateToken = (userId: string, isAdmin: boolean) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not defined");
  return jwt.sign({ id: userId, isAdmin }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};
