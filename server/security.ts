// HTTP security helpers: response headers, a cross-site request guard for
// cookie-authenticated routes, and upload checks that don't trust the browser.
import type { RequestHandler, Response } from "express";
import { HttpError } from "./http.js";

const isProd = () => process.env.NODE_ENV === "production";

/** Baseline headers for every response. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Our pages may frame each other (the simulator does), nobody else may frame them (clickjacking).
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // Once served over HTTPS, tell browsers never to use plain HTTP for this domain.
  if (isProd()) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
};

/**
 * CSRF guard for routes that rely on the session cookie. SameSite=Lax already stops
 * most cross-site posts; this also rejects any state-changing request whose Origin
 * (or Referer) is another site. Requests with neither header (curl, server-to-server)
 * carry no browser cookie risk and are allowed.
 */
export const sameOriginOnly: RequestHandler = (req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const source = req.get("origin") ?? req.get("referer");
  if (!source || source === "null") return next();
  let host: string;
  try { host = new URL(source).host; } catch { return next(new HttpError(403, "Request blocked.")); }
  const allowed = new Set([req.get("host")]);
  if (process.env.APP_URL) { try { allowed.add(new URL(process.env.APP_URL).host); } catch {} }
  if (!allowed.has(host)) return next(new HttpError(403, "Request blocked."));
  next();
};

/** Image types we accept, identified by their first bytes, never by name or browser-sent type. */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: "png", mime: "image/png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { ext: "jpg", mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "gif", mime: "image/gif", test: (b) => b.length > 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1")) },
  { ext: "webp", mime: "image/webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

/**
 * Returns a safe name + type for an uploaded image, or throws 400. SVG is refused:
 * it can carry scripts, and uploads are served from our own domain.
 */
export function checkImage(buffer: Buffer): { originalName: string; mimetype: string } {
  const sig = SIGNATURES.find((s) => s.test(buffer));
  if (!sig) throw new HttpError(400, "Please upload a PNG, JPG, GIF or WebP image.");
  return { originalName: `image.${sig.ext}`, mimetype: sig.mime };
}

/** Headers for files under /uploads: never run as a page, cache forever (names are unique). */
export function uploadHeaders(res: Response) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
}
