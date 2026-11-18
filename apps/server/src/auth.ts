import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config, isProduction } from "./config.js";

const COOKIE = "yotzim_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function sign(payload: string) {
  return crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

function makeToken() {
  const payload = `admin.${Date.now() + MAX_AGE_MS}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const expires = Number(payload.split(".")[1]);
  return Number.isFinite(expires) && expires > Date.now();
}

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function login(req: Request, res: Response) {
  const password = String(req.body?.password ?? "");
  if (!safeEqual(password, config.adminPassword)) {
    res.status(401).json({ error: "סיסמה שגויה" });
    return;
  }
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: MAX_AGE_MS,
  });
  res.json({ ok: true });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}

export function isAuthed(req: Request) {
  return verifyToken(req.cookies?.[COOKIE]);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "נדרשת התחברות" });
}
