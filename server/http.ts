import type { RequestHandler } from "express";
import { NotFound } from "./store.js";
import { errFields, log } from "./log.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps an async handler so thrown errors become JSON responses instead of unhandled rejections. */
export function handle(fn: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof NotFound) return res.status(404).json({ error: err.message });
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      log.error("request error", { requestId: res.locals.requestId, method: req.method, path: req.path, ...errFields(err) });
      res.status(500).json({ error: "Something went wrong." });
    }
  };
}

/** CORS for endpoints the embedded widget calls from customers' domains. */
export const openCors: RequestHandler = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
};
