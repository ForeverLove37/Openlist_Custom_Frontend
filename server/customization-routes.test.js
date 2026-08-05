import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp, THUMBNAIL_SESSION_COOKIE } from "./app.js";
import { ThumbnailAccessError } from "./thumbnail-service.js";

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function sessionCookie(id) {
  return { Cookie: `${THUMBNAIL_SESSION_COOKIE}=${id}` };
}

describe("customization HTTP routes", () => {
  it("keeps branding public while enforcing admin and per-user session boundaries", async () => {
    const sessions = new Map([
      ["user-session", { userId: 9, role: 0, authorization: "user-token" }],
      ["admin-session", { userId: 2, role: 2, authorization: "admin-token" }],
      ["guest-session", { userId: 1, role: 1, authorization: "" }],
    ]);
    const thumbnailService = {
      getSession: vi.fn((id) => {
        const session = sessions.get(id);
        if (!session) throw new ThumbnailAccessError("Thumbnail session expired.");
        return session;
      }),
    };
    const customizationService = {
      getBranding: vi.fn().mockResolvedValue({ name: "Team Drive", logoUrl: "", iconUrl: "" }),
      updateBranding: vi.fn(async ({ name }) => ({ name, logoUrl: "", iconUrl: "" })),
      getProfile: vi.fn().mockResolvedValue({ avatarUrl: "" }),
      saveAvatar: vi.fn().mockResolvedValue({ avatarUrl: "/api/custom/profile/avatar?v=1" }),
    };
    const app = createApp({
      thumbnailService,
      customizationService,
      remoteStorageService: {},
      production: false,
    });

    await withServer(app, async (baseUrl) => {
      const publicBranding = await fetch(`${baseUrl}/api/custom/branding`);
      expect(publicBranding.status).toBe(200);
      expect((await publicBranding.json()).data.name).toBe("Team Drive");

      const deniedBranding = await fetch(`${baseUrl}/api/custom/admin/branding`, {
        method: "PUT",
        headers: { ...sessionCookie("user-session"), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Private Drive" }),
      });
      expect(deniedBranding.status).toBe(403);
      expect(customizationService.updateBranding).not.toHaveBeenCalled();

      const savedBranding = await fetch(`${baseUrl}/api/custom/admin/branding`, {
        method: "PUT",
        headers: { ...sessionCookie("admin-session"), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Private Drive" }),
      });
      expect(savedBranding.status).toBe(200);
      expect(customizationService.updateBranding).toHaveBeenCalledWith({ name: "Private Drive" });

      const profile = await fetch(`${baseUrl}/api/custom/profile`, { headers: sessionCookie("user-session") });
      expect(profile.status).toBe(200);
      expect(customizationService.getProfile).toHaveBeenCalledWith(9);

      const image = Uint8Array.from([137, 80, 78, 71]);
      const avatar = await fetch(`${baseUrl}/api/custom/profile/avatar`, {
        method: "PUT",
        headers: { ...sessionCookie("user-session"), "Content-Type": "image/png" },
        body: image,
      });
      expect(avatar.status).toBe(200);
      expect(customizationService.saveAvatar).toHaveBeenCalledWith(9, expect.any(Buffer), "image/png");
      expect(customizationService.saveAvatar.mock.calls[0][1]).toEqual(Buffer.from(image));

      const guestProfile = await fetch(`${baseUrl}/api/custom/profile`, { headers: sessionCookie("guest-session") });
      expect(guestProfile.status).toBe(401);
    });
  });
});
