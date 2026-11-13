import express from "express";
import fs from "fs/promises";
import path from "path";
import { config as loadEnv } from "dotenv";
import { DIST_DIR, ROOT, UPLOADS_DIR } from "./paths.js";
import { publicRoutes } from "./routes/public.js";
import { botRoutes } from "./routes/bots.js";
import { authRoutes } from "./routes/auth.js";
import { simulateRoutes } from "./routes/simulate.js";
import { db } from "./db/index.js";
import { HttpError } from "./http.js";
import { errFields, log, requestLogger } from "./log.js";
import { securityHeaders, uploadHeaders } from "./security.js";

loadEnv({ path: [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")], quiet: true });

const isProd = process.env.NODE_ENV === "production";
const startedAt = Date.now();
let shuttingDown = false;

async function startServer() {
  // Choose the database early so a bad Supabase config fails at boot, not on the first request.
  const database = db();
  if (database.kind === "json") {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    if (isProd && !process.env.DATA_DIR) {
      log.warn("Production is using local JSON files in ./data. Set DATA_DIR to a persistent disk, or configure Supabase, so data survives redeploys.");
    }
  }

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  // Behind a reverse proxy (nginx, Render, Railway…) set TRUST_PROXY=1 so rate
  // limiting sees real visitor IPs instead of the proxy's.
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(requestLogger);
  app.use(securityHeaders);

  // Liveness + readiness for the host / load balancer. 503 while shutting down or when the database is unreachable.
  app.get("/api/health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (shuttingDown) return res.status(503).json({ ok: false, reason: "shutting down" });
    try {
      await Promise.race([
        database.users.count(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("database check timed out")), 3000)),
      ]);
      res.json({ ok: true, db: database.kind, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
    } catch (err) {
      log.error("health check failed", errFields(err));
      res.status(503).json({ ok: false, reason: "database unavailable" });
    }
  });

  app.use(express.json({ limit: "2mb" }));
  // Uploaded images: never executed as a page, cached long-term (file names are unique).
  app.use("/uploads", express.static(UPLOADS_DIR, { setHeaders: uploadHeaders, index: false, dotfiles: "deny" }));
  app.use("/uploads", (_req, res) => res.status(404).end()); // a missing image is a 404, not the app's HTML
  app.use(publicRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/bots", botRoutes);
  app.use("/api/simulate", simulateRoutes);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  // Errors raised by middleware (body parser, multer, the CSRF guard) — keep API responses JSON.
  app.use("/api", ((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "That file is larger than 5 MB." });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
    log.error("unhandled api error", { requestId: res.locals.requestId, ...errFields(err) });
    res.status(500).json({ error: "Something went wrong." });
  }) as express.ErrorRequestHandler);

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: ROOT,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Hashed build assets never change; the HTML shell is always revalidated so deploys show up immediately.
    app.use("/assets", express.static(path.join(DIST_DIR, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(DIST_DIR, { maxAge: 0 }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(DIST_DIR, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    log.info(`Syncave running on http://localhost:${PORT}`, { db: database.kind, env: process.env.NODE_ENV ?? "development" });
  });
  // Don't let slow or stalled clients hold connections open forever.
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  // Longer than typical load-balancer idle timeouts (60 s), so the proxy closes first.
  server.keepAliveTimeout = 65_000;

  // Graceful shutdown: stop taking new connections, let in-flight requests (and their
  // database writes) finish, then exit. Hosts send SIGTERM before replacing an instance.
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    server.close(() => {
      log.info("shutdown complete");
      process.exit(0);
    });
    server.closeIdleConnections?.();
    setTimeout(() => {
      log.warn("forcing exit after 10 s; some requests were still open");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => log.error("unhandled promise rejection", errFields(reason)));
process.on("uncaughtException", (err) => {
  log.error("uncaught exception", errFields(err));
  process.exit(1);
});

startServer().catch((err) => {
  log.error("failed to start", errFields(err));
  process.exit(1);
});
