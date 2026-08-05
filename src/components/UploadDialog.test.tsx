// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { UploadDialog } from "./UploadDialog";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(cleanup);

describe("UploadDialog", () => {
  it("opens the file chooser only from the explicit choose button", () => {
    const onBrowse = vi.fn();
    render(<UploadDialog path="/Documents" onClose={vi.fn()} onFiles={vi.fn()} onBrowse={onBrowse} />);

    const dropZone = screen.getByRole("region", { name: "Drag and drop files here" });
    expect(dropZone).toBeInTheDocument();
    fireEvent.click(dropZone);
    expect(onBrowse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Choose files" }));

    expect(onBrowse).toHaveBeenCalledTimes(1);
  });

  it("passes dropped files to the upload handler", () => {
    const onFiles = vi.fn();
    const file = new File(["content"], "notes.txt", { type: "text/plain" });
    const dropZone = screenElement(() => render(<UploadDialog path="/Documents" onClose={vi.fn()} onFiles={onFiles} onBrowse={vi.fn()} />));

    fireEvent.dragEnter(dropZone, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(dropZone).toHaveClass("upload-drop-zone--active");
    fireEvent.drop(dropZone, { dataTransfer: { types: ["Files"], files: [file] } });

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(dropZone).not.toHaveClass("upload-drop-zone--active");
  });
});

function screenElement(renderView: () => void) {
  renderView();
  return screen.getByRole("region", { name: "Drag and drop files here" });
}
