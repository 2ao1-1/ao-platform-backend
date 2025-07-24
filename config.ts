const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || "secret",
  dbUrl: process.env.DATABASE_URL || "",
};

export default config;
