// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileBrowser } from "./FileBrowser";
import type { OpenListItem } from "../lib/types";

const photo: OpenListItem = {
  name: "mountain.jpg",
  size: 2048,
  is_dir: false,
  modified: "2026-01-01T00:00:00Z",
  created: "2026-01-01T00:00:00Z",
  sign: "",
  thumb: "https://files.test/thumb.jpg",
  type: 0,
  hashinfo: "",
};

describe("FileBrowser", () => {
  it("renders the API thumbnail and opens the selected item", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <FileBrowser items={[photo]} view="grid" loading={false} onOpen={onOpen} onDownload={vi.fn()} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", photo.thumb);
    fireEvent.click(screen.getByTitle("Open mountain.jpg"));
    expect(onOpen).toHaveBeenCalledWith(photo);
  });
});
