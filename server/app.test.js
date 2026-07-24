import { describe, expect, it, vi } from "vitest";
import { requireAdminSession } from "./app.js";
import { ThumbnailAccessError } from "./thumbnail-service.js";

describe("BFF admin session boundary", () => {
  it("returns a verified administrator session", () => {
    const session = { id: "session-id", role: 2, authorization: "verified-admin-token" };
    const thumbnailService = { getSession: vi.fn().mockReturnValue(session) };
    expect(requireAdminSession(thumbnailService, "session-id")).toBe(session);
    expect(thumbnailService.getSession).toHaveBeenCalledWith("session-id");
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
