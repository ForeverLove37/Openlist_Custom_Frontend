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
  const managementProps = {
    canManage: false,
    selectedNames: new Set<string>(),
    onToggleSelection: vi.fn(),
    onToggleAll: vi.fn(),
    onOpenActions: vi.fn(),
  };

  it("renders the API thumbnail and opens the selected item", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <FileBrowser items={[photo]} view="grid" loading={false} directoryPath="/" customThumbnailsEnabled onOpen={onOpen} onDownload={vi.fn()} {...managementProps} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", photo.thumb);
    fireEvent.click(screen.getByTitle("Open mountain.jpg"));
    expect(onOpen).toHaveBeenCalledWith(photo);
  });

  it("uses the custom thumbnail endpoint for media without a native thumbnail", () => {
    const { container } = render(
      <FileBrowser items={[{ ...photo, thumb: "" }]} view="grid" loading={false} directoryPath="/Pictures" customThumbnailsEnabled onOpen={vi.fn()} onDownload={vi.fn()} {...managementProps} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/custom/thumb?path=%2FPictures%2Fmountain.jpg&type=image");
  });

  it("selects items and opens their action menu without opening the file", () => {
    const onOpen = vi.fn();
    const onToggleSelection = vi.fn();
    const onOpenActions = vi.fn();
    render(
      <FileBrowser
        items={[photo]}
        view="list"
        loading={false}
        directoryPath="/Pictures"
        customThumbnailsEnabled
        onOpen={onOpen}
        onDownload={vi.fn()}
        canManage
        selectedNames={new Set()}
        onToggleSelection={onToggleSelection}
        onToggleAll={vi.fn()}
        onOpenActions={onOpenActions}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select mountain.jpg"));
    fireEvent.click(screen.getByTitle("Actions for mountain.jpg"));

    expect(onToggleSelection).toHaveBeenCalledWith(photo);
    expect(onOpenActions).toHaveBeenCalledWith(photo, expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
