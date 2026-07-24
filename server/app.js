import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { ThumbnailAccessError, createThumbnailService, fallbackSvg } from "./thumbnail-service.js";

export const THUMBNAIL_SESSION_COOKIE = "openlist_thumb_session";

function readCookies(header = "") {
  return Object.fromEntries(header.split(";").map((pair) => {
    const index = pair.indexOf("=");
    return index < 0 ? ["", ""] : [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1))];
  }).filter(([name]) => name));
}

function sendEnvelope(response, data = null) {
  response.json({ code: 200, message: "success", data });
}

export function createApp({
  distDir = path.resolve("dist"),
  thumbnailService = createThumbnailService(),
  production = process.env.NODE_ENV === "production",
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));

  const sessionId = (request) => readCookies(request.headers.cookie)[THUMBNAIL_SESSION_COOKIE];
  const sessionCookie = (response, id) => response.cookie(THUMBNAIL_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "strict",
    secure: production,
    maxAge: 30 * 60 * 1000,
    path: "/",
  });

  app.post("/api/custom/session", async (request, response) => {
    try {
      const id = sessionId(request);
      const directoryPath = request.body?.path || "/";
      const password = request.body?.password || "";
      const authorization = request.get("Authorization") || "";
      let existing;
      try {
        existing = id ? thumbnailService.getSession(id) : undefined;
      } catch {
        existing = undefined;
      }
      if (existing && existing.authorization === authorization) {
        thumbnailService.updateSession(id, directoryPath, password);
        sessionCookie(response, id);
      } else {
        if (id) thumbnailService.deleteSession(id);
        const session = await thumbnailService.createSession(authorization, directoryPath, password);
        sessionCookie(response, session.id);
      }
      sendEnvelope(response);
    } catch (error) {
      response.clearCookie(THUMBNAIL_SESSION_COOKIE, { path: "/" });
      const status = error instanceof ThumbnailAccessError ? error.status : 500;
      response.status(status).json({ code: status, message: error.message || "Could not create a thumbnail session.", data: null });
    }
  });

  app.post("/api/custom/session/clear", (request, response) => {
    thumbnailService.deleteSession(sessionId(request));
    response.clearCookie(THUMBNAIL_SESSION_COOKIE, { path: "/" });
    sendEnvelope(response);
  });

  app.get("/api/custom/thumb", async (request, response) => {
    const type = request.query.type;
    try {
      const session = thumbnailService.getSession(sessionId(request));
      const thumbnailFile = await thumbnailService.getThumbnail(session, request.query.path, type);
      response.set({
        "Cache-Control": "private, max-age=600",
        "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff",
      });
      response.type("image/webp").sendFile(thumbnailFile);
    } catch (error) {
      if (error instanceof ThumbnailAccessError) {
        response.status(error.status).json({ code: error.status, message: error.message, data: null });
        return;
      }
      response.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.type("image/svg+xml").status(200).send(fallbackSvg(type));
    }
  });

  app.get("/healthz", async (_request, response) => {
    const hasDist = await stat(path.join(distDir, "index.html")).then(() => true).catch(() => false);
    response.status(hasDist ? 200 : 503).json({ ok: hasDist, requestId: randomUUID() });
  });

  app.use(express.static(distDir, {
    etag: true,
    maxAge: production ? "1y" : 0,
    immutable: production,
    index: false,
  }));
  app.use((request, response) => {
    if (request.path.startsWith("/api/")) {
      response.status(404).json({ code: 404, message: "Not found", data: null });
      return;
    }
    response.set("Cache-Control", "no-cache").sendFile(path.join(distDir, "index.html"));
  });

  return app;
}
