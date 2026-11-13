import type { Request, RequestHandler, Response } from "express";
import type { User } from "../../shared/types.js";
import { toPublicUser, userForSession } from "./accounts.js";

export const SESSION_COOKIE = "syncave_session";

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i !== -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

const isProd = () => process.env.NODE_ENV === "production";

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,          // not readable from page JavaScript
    sameSite: "lax",         // not sent on cross-site POSTs (CSRF protection)
    secure: isProd(),        // HTTPS-only once deployed
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/" });
}

/** Rejects the request with 401 unless it carries a valid session; stores the user in res.locals. */
export const requireUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userForSession(readCookie(req, SESSION_COOKIE));
    if (!user) return res.status(401).json({ error: "Please log in." });
    res.locals.user = toPublicUser(user);
    next();
  } catch (err) {
    next(err);
  }
};

export function currentUser(res: Response): User {
  return res.locals.user as User;
}
