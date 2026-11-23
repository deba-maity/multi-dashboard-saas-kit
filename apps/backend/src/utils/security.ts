import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

type AccessPayload = {
  userId: string;
  organizationId: string;
  role: "ADMIN" | "MEMBER";
};

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });

export const signRefreshToken = (userId: string, organizationId: string) =>
  jwt.sign(
    { userId, organizationId },
    env.JWT_REFRESH_SECRET,
    { jwtid: crypto.randomUUID(), expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` as jwt.SignOptions["expiresIn"] }
  );

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string; organizationId?: string };
