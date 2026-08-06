import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { CustomizationError, createCustomizationService } from "./customization-service.js";
import { RemoteStorageError, createRemoteStorageService } from "./remote-storage-service.js";
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

export function requireAdminSession(thumbnailService, id) {
  const session = thumbnailService.getSession(id);
  if (session.role !== 2) throw new ThumbnailAccessError("Administrator access is required.", 403);
  return session;
}

export function requireUserSession(thumbnailService, id) {
  const session = thumbnailService.getSession(id);
  if (!session.authorization || session.role === 1) throw new ThumbnailAccessError("Sign in to manage your profile.", 401);
  return session;
}

export function createApp({
  distDir = path.resolve("dist"),
  thumbnailService = createThumbnailService(),
  remoteStorageService = createRemoteStorageService(),
  customizationService = createCustomizationService(),
  production = process.env.NODE_ENV === "production",
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  const imageBody = express.raw({ type: () => true, limit: "5mb" });

  const sessionId = (request) => readCookies(request.headers.cookie)[THUMBNAIL_SESSION_COOKIE];
  const sessionCookie = (response, id) => response.cookie(THUMBNAIL_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "strict",
    secure: production,
    maxAge: 30 * 60 * 1000,
    path: "/",
  });
  const adminSession = (request) => requireAdminSession(thumbnailService, sessionId(request));
  const userSession = (request) => requireUserSession(thumbnailService, sessionId(request));
  const customizationError = (response, error, fallbackMessage) => {
    const status = error instanceof ThumbnailAccessError || error instanceof CustomizationError ? error.status : 500;
    response.status(status).json({ code: status, message: error.message || fallbackMessage, data: null });
  };

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

  app.get("/api/custom/branding", async (_request, response) => {
    try {
      response.set("Cache-Control", "no-store");
      sendEnvelope(response, await customizationService.getBranding());
    } catch (error) {
      customizationError(response, error, "Could not load frontend branding.");
    }
  });

  app.get("/api/custom/branding/:kind", async (request, response) => {
    try {
      const kind = request.params.kind;
      const asset = await customizationService.getBrandAssetFile(kind);
      response.set({ "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
      response.type(kind === "icon" ? "image/png" : "image/webp").sendFile(asset);
    } catch (error) {
      customizationError(response, error, "Could not load the branding image.");
    }
  });

  app.put("/api/custom/admin/branding", async (request, response) => {
    try {
      adminSession(request);
      sendEnvelope(response, await customizationService.updateBranding(request.body));
    } catch (error) {
      customizationError(response, error, "Could not update frontend branding.");
    }
  });

  app.put("/api/custom/admin/branding/:kind", imageBody, async (request, response) => {
    try {
      adminSession(request);
      sendEnvelope(response, await customizationService.saveBrandAsset(request.params.kind, request.body, request.get("Content-Type") || ""));
    } catch (error) {
      customizationError(response, error, "Could not update the branding image.");
    }
  });

  app.delete("/api/custom/admin/branding/:kind", async (request, response) => {
    try {
      adminSession(request);
      sendEnvelope(response, await customizationService.deleteBrandAsset(request.params.kind));
    } catch (error) {
      customizationError(response, error, "Could not remove the branding image.");
    }
  });

  app.get("/api/custom/profile", async (request, response) => {
    try {
      const session = userSession(request);
      response.set({ "Cache-Control": "no-store", "Vary": "Cookie" });
      sendEnvelope(response, await customizationService.getProfile(session.userId));
    } catch (error) {
      customizationError(response, error, "Could not load your profile.");
    }
  });

  app.get("/api/custom/profile/avatar", async (request, response) => {
    try {
      const session = userSession(request);
      const avatar = await customizationService.getAvatarFile(session.userId);
      response.set({ "Cache-Control": "private, max-age=31536000, immutable", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" });
      response.type("image/webp").sendFile(avatar);
    } catch (error) {
      customizationError(response, error, "Could not load your avatar.");
    }
  });

  app.put("/api/custom/profile/avatar", imageBody, async (request, response) => {
    try {
      const session = userSession(request);
      sendEnvelope(response, await customizationService.saveAvatar(session.userId, request.body, request.get("Content-Type") || ""));
    } catch (error) {
      customizationError(response, error, "Could not update your avatar.");
    }
  });

  app.delete("/api/custom/profile/avatar", async (request, response) => {
    try {
      const session = userSession(request);
      sendEnvelope(response, await customizationService.deleteAvatar(session.userId));
    } catch (error) {
      customizationError(response, error, "Could not remove your avatar.");
    }
  });

  app.get("/api/custom/tunnel-auth", (request, response) => {
    try {
      const session = adminSession(request);
      response.set("X-OpenList-Authorization", session.authorization).status(204).send();
    } catch (error) {
      const status = error instanceof ThumbnailAccessError ? error.status : 500;
      response.status(status).send();
    }
  });

  app.get("/api/custom/remote-storages/:connectionId", async (request, response) => {
    try {
      sendEnvelope(response, await remoteStorageService.list(adminSession(request), request.params.connectionId));
    } catch (error) {
      const status = error instanceof ThumbnailAccessError || error instanceof RemoteStorageError ? error.status : 500;
      response.status(status).json({ code: status, message: error.message || "Could not load remote storages.", data: null });
    }
  });

  app.patch("/api/custom/remote-storages/:connectionId/:storageId/transfer", async (request, response) => {
    try {
      sendEnvelope(response, await remoteStorageService.updateTransferMode(
        adminSession(request),
        request.params.connectionId,
        request.params.storageId,
        request.body,
      ));
    } catch (error) {
      const status = error instanceof ThumbnailAccessError || error instanceof RemoteStorageError ? error.status : 500;
      response.status(status).json({ code: status, message: error.message || "Could not update the remote storage.", data: null });
    }
  });

  const previewHandler = async (request, response) => {
    let source;
    try {
      const kind = typeof request.query.kind === "string" ? request.query.kind : "";
      if (kind !== "pdf" && kind !== "text" && kind !== "markdown") {
        throw new ThumbnailAccessError("The preview type is invalid.", 400);
      }
      const session = thumbnailService.getSession(sessionId(request));
      source = await thumbnailService.getPreviewSource(session, request.query.path);
      response.set({
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Type": kind === "pdf" ? "application/pdf" : "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      source.data.on("error", (error) => response.destroy(error));
      source.data.pipe(response);
    } catch (error) {
      source?.data?.destroy?.();
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status = error instanceof ThumbnailAccessError ? error.status : 500;
      response.status(status).json({ code: status, message: error.message || "Could not load the file preview.", data: null });
    }
  };
  // Keep a root-level alias for installations whose legacy Nginx config only
  // forwards `/` to the BFF and sends `/api/custom/` to OpenList.
  app.get(["/api/custom/preview", "/preview"], previewHandler);

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
      console.warn(`[thumbnail] ${type === "video" ? "video" : "image"} generation failed: ${error instanceof Error ? error.message : "unknown error"}`);
      response.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.type("image/svg+xml").status(200).send(fallbackSvg(type));
    }
  });

  app.use((error, request, response, next) => {
    if (!request.path.startsWith("/api/custom/")) {
      next(error);
      return;
    }
    const status = error?.type === "entity.too.large" ? 413 : 400;
    response.status(status).json({ code: status, message: status === 413 ? "Images must be 5 MB or smaller." : "The request body is invalid.", data: null });
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
