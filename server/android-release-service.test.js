import { describe, expect, it, vi } from "vitest";
import { AndroidReleaseError, createAndroidReleaseService } from "./android-release-service.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Android release service", () => {
  it("decorates release filenames with public download URLs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      latestVersion: "1.2.3",
      releases: [{ version: "1.2.3", filename: "openlist drive-1.2.3.apk" }],
    }));
    const service = createAndroidReleaseService({
      baseUrl: "https://builder.example.test",
      token: "server-secret",
      downloadBaseUrl: "https://downloads.example.test/",
      fetchImpl,
    });

    await expect(service.list()).resolves.toMatchObject({
      releases: [{ downloadUrl: "https://downloads.example.test/apk/openlist%20drive-1.2.3.apk" }],
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://builder.example.test/api/releases");
    expect(options.headers.get("Authorization")).toBe("Bearer server-secret");
  });

  it("forwards full-build values as JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, job: { id: "job-id" } }, 202));
    const service = createAndroidReleaseService({ baseUrl: "https://builder.example.test", token: "secret", fetchImpl });

    await service.triggerBuild({ version: "2.0.0", versionCode: 20 });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://builder.example.test/api/admin/build");
    expect(options).toMatchObject({ method: "POST", body: '{"version":"2.0.0","versionCode":20}' });
    expect(options.headers.get("Content-Type")).toBe("application/json");
  });

  it("preserves remote validation errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false, message: "Version already exists." }, 409));
    const service = createAndroidReleaseService({ baseUrl: "https://builder.example.test", fetchImpl });

    await expect(service.publish("1.0.0")).rejects.toMatchObject({
      name: "AndroidReleaseError",
      status: 409,
      message: "Version already exists.",
    });
    await expect(service.publish("1.0.0")).rejects.toBeInstanceOf(AndroidReleaseError);
  });
});
