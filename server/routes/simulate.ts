// The simulator: show a visitor's own website with a Syncave bot on top.
//
// POST /api/simulate {url}  → fetches the site once, keeps a snapshot for 15 min,
//                             returns an id + title + detected language.
// GET  /api/simulate/:id    → serves that snapshot for the simulator's <iframe>.
//
// Safety: the snapshot is served with a CSP `sandbox` header (no allow-same-origin),
// so the page runs in an opaque origin even though it comes from our domain: its
// scripts can't read our cookies or call our API as the logged-in user. Forms are
// disabled and snapshots expire quickly, so the URL is useless for phishing.
import { Router } from "express";
import { rid } from "../../shared/types.js";
import { buildSitePreview, normalizeUrl } from "../site.js";
import { BlockedAddress } from "../safeFetch.js";
import { handle, HttpError } from "../http.js";
import { rateLimit } from "../rateLimit.js";

const TTL_MS = 15 * 60 * 1000;
const MAX_SNAPSHOTS = 60;

const snapshots = new Map<string, { html: string; expiresAt: number }>();

function prune() {
  const now = Date.now();
  for (const [id, s] of snapshots) if (s.expiresAt <= now) snapshots.delete(id);
  // Oldest first (Map keeps insertion order).
  while (snapshots.size >= MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!);
}

export const simulateRoutes = Router();

simulateRoutes.post(
  "/",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many previews. Please wait a few minutes." }),
  handle(async (req, res) => {
    const url = normalizeUrl(String(req.body?.url ?? ""));
    if (!url) throw new HttpError(400, "Enter a valid website address, like example.com");

    let preview;
    try {
      preview = await buildSitePreview(url);
    } catch (e) {
      if (e instanceof BlockedAddress) throw new HttpError(400, "That address can't be previewed.");
      throw new HttpError(422, "We couldn't load that website. Check the address, or try again in a moment.");
    }

    prune();
    const id = rid(16) + rid(16);
    snapshots.set(id, { html: preview.html, expiresAt: Date.now() + TTL_MS });
    res.json({ id, url: preview.finalUrl, title: preview.title, lang: preview.lang });
  })
);

simulateRoutes.get("/:id", (req, res) => {
  const snap = snapshots.get(req.params.id);
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  if (!snap || snap.expiresAt <= Date.now()) {
    return res
      .status(410)
      .type("html")
      .send('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;color:#64748b;display:grid;place-items:center;height:100vh;margin:0">This preview has expired. Reload the simulator.</body>');
  }
  res.type("html").send(snap.html);
});
