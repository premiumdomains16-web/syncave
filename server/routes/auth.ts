// Sign up, log in, log out, and "who am I".
import { Router } from "express";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/passwords.js";
import { createSession, createUser, deleteSession, EmailTaken, findUserByEmail, toPublicUser } from "../auth/accounts.js";
import { clearSessionCookie, currentUser, readCookie, requireUser, SESSION_COOKIE, setSessionCookie } from "../auth/middleware.js";
import { claimUnownedBots } from "../store.js";
import { handle, HttpError } from "../http.js";
import { rateLimit } from "../rateLimit.js";
import { sameOriginOnly } from "../security.js";
import type { Plan } from "../../shared/types.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const PLANS: Plan[] = ["free", "starter", "business", "agency"];

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

export const authRoutes = Router();

// Cookie-based: refuse state-changing requests coming from other websites (CSRF).
authRoutes.use(sameOriginOnly);

authRoutes.post(
  "/signup",
  authLimiter,
  handle(async (req, res) => {
    const { name, email, password, plan } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) throw new HttpError(400, "Please enter your name.");
    if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email.trim())) throw new HttpError(400, "Please enter a valid email address.");
    if (typeof password !== "string" || password.length < MIN_PASSWORD) {
      throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters.`);
    }
    if (password.length > 200) throw new HttpError(400, "Password is too long.");

    let created;
    try {
      created = await createUser({
        name,
        email,
        passwordHash: await hashPassword(password),
        requestedPlan: PLANS.includes(plan) ? plan : undefined,
      });
    } catch (e) {
      if (e instanceof EmailTaken) throw new HttpError(409, e.message);
      throw e;
    }
    // Sites created before accounts existed belong to whoever sets the server up.
    if (created.isFirst) await claimUnownedBots(created.user.id);

    const session = await createSession(created.user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({ user: toPublicUser(created.user) });
  })
);

authRoutes.post(
  "/login",
  authLimiter,
  handle(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") throw new HttpError(400, "Email and password are required.");
    // Hashing a huge "password" is expensive; nothing over the sign-up maximum can be correct anyway.
    if (email.length > 254 || password.length > 200) throw new HttpError(401, "Incorrect email or password.");
    const user = await findUserByEmail(email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
    // Same message either way, so the form doesn't reveal which emails have accounts.
    if (!user || !ok) throw new HttpError(401, "Incorrect email or password.");
    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({ user: toPublicUser(user) });
  })
);

authRoutes.post(
  "/logout",
  handle(async (req, res) => {
    await deleteSession(readCookie(req, SESSION_COOKIE));
    clearSessionCookie(res);
    res.json({ success: true });
  })
);

authRoutes.get(
  "/me",
  requireUser,
  handle(async (_req, res) => {
    res.json({ user: currentUser(res) });
  })
);
