import { describe, expect, it, vi } from "vitest";
import { requireAdminSession, requireUserSession } from "./app.js";
import { ThumbnailAccessError } from "./thumbnail-service.js";

describe("BFF admin session boundary", () => {
  it("returns a verified administrator session", () => {
    const session = { id: "session-id", role: 2, authorization: "verified-admin-token" };
    const thumbnailService = { getSession: vi.fn().mockReturnValue(session) };
    expect(requireAdminSession(thumbnailService, "session-id")).toBe(session);
    expect(thumbnailService.getSession).toHaveBeenCalledWith("session-id");
  });

  it("allows signed-in users to manage only their session-owned profile", () => {
    const session = { id: "session-id", userId: 9, role: 0, authorization: "verified-user-token" };
    const thumbnailService = { getSession: vi.fn().mockReturnValue(session) };
    expect(requireUserSession(thumbnailService, "session-id")).toBe(session);
  });

  it("rejects guest sessions for profile writes", () => {
    const thumbnailService = { getSession: vi.fn().mockReturnValue({ userId: 1, role: 1, authorization: "" }) };
    expect(() => requireUserSession(thumbnailService, "guest-session")).toThrow("Sign in to manage your profile");
  });

  it("rejects a verified non-administrator session", () => {
    const thumbnailService = { getSession: vi.fn().mockReturnValue({ id: "session-id", role: 1 }) };
    expect(() => requireAdminSession(thumbnailService, "session-id")).toThrow(ThumbnailAccessError);
    try {
      requireAdminSession(thumbnailService, "session-id");
    } catch (error) {
      expect(error).toMatchObject({ status: 403, message: "Administrator access is required." });
    }
  });

  it("does not bypass an expired or missing thumbnail session", () => {
    const expired = new ThumbnailAccessError("Thumbnail session expired.");
    const thumbnailService = { getSession: vi.fn(() => { throw expired; }) };
    expect(() => requireAdminSession(thumbnailService, "expired")).toThrow(expired);
  });
});
