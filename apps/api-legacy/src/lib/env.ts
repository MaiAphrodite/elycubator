function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  jwtSecret: requireEnv("JWT_SECRET"),
  deviceSecret: requireEnv("DEVICE_SECRET"),
  jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "15m",
  refreshExpiresIn: process.env["REFRESH_TOKEN_EXPIRES_IN"] ?? "7d",
  deviceTokenExpiresIn: process.env["DEVICE_TOKEN_EXPIRES_IN"] ?? "30d",
};
