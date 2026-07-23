// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Gallery } from "./Gallery";
import type { OpenListItem } from "../lib/types";

const images: OpenListItem[] = ["first.jpg", "second.jpg"].map((name) => ({
  name,
  size: 1,
  is_dir: false,
  modified: "2026-01-01T00:00:00Z",
  created: "2026-01-01T00:00:00Z",
  sign: "",
  thumb: `https://files.test/thumb-${name}`,
  type: 0,
  hashinfo: "",
}));

afterEach(() => vi.restoreAllMocks());

describe("Gallery", () => {
  it("resolves only the active original and resolves the next on navigation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const requested = JSON.parse(String(options?.body)).path as string;
      return new Response(JSON.stringify({
        code: 200,
        message: "success",
        data: { raw_url: `https://files.test/raw${requested}` },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<Gallery images={images} initialIndex={0} directoryPath="/Photos" password="" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByAltText("first.jpg")).toHaveAttribute("src", "https://files.test/raw/Photos/first.jpg");

    fireEvent.click(screen.getByTitle("Next image"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Image preview: second.jpg")).toBeInTheDocument();
  });
});
