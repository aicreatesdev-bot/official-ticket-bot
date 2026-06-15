import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "./env.js";

export type DiscordGuildSummary = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

export type SessionUser = {
  id: string;
  username: string;
  avatar: string | null;
  discriminator?: string;
};

export type SessionPayload = {
  user: SessionUser;
  guilds: DiscordGuildSummary[];
  issuedAt: number;
};

const cookieName = "rose_session";

export function setSession(res: Response, payload: SessionPayload) {
  res.cookie(cookieName, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearSession(res: Response) {
  res.clearCookie(cookieName, { path: "/", domain: env.COOKIE_DOMAIN || undefined });
}

export function getSession(req: Request): SessionPayload | null {
  const raw = req.cookies?.[cookieName];
  if (!raw || typeof raw !== "string") return null;
  return verify(raw);
}

function sign(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verify(value: string): SessionPayload | null {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", env.SESSION_SECRET).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (Date.now() - payload.issuedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
