// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDirectory } from "./useDirectory";

function directoryResponse(name: string) {
  return new Response(JSON.stringify({
    code: 200,
    message: "success",
    data: { content: [{ name, is_dir: false }], total: 1, readme: "", header: "", write: false, write_content_bypass: false, provider: "" },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useDirectory", () => {
  it("uses a cache-bypassing request only for the manual refresh action", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(directoryResponse("cached.txt"))
      .mockResolvedValueOnce(directoryResponse("fresh.txt"))
      .mockResolvedValueOnce(directoryResponse("cached-again.txt"));
    const { result } = renderHook(() => useDirectory("/Projects", ""));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty("refresh");

    act(() => result.current.forceRefresh());
    await waitFor(() => expect(result.current.manualRefreshCount).toBe(1));
    expect(result.current.data.content?.[0]?.name).toBe("fresh.txt");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ path: "/Projects", refresh: true });

    act(() => result.current.refresh());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).not.toHaveProperty("refresh");
  });
});
