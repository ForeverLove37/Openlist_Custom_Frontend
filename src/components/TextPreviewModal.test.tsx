// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { TextPreviewModal } from "./TextPreviewModal";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TextPreviewModal", () => {
  it("loads plain text and keeps the modal open when the surface is clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("hello\nworld", { status: 200 }));
    const onClose = vi.fn();
    render(<TextPreviewModal name="notes.txt" source="/d/notes.txt" kind="text" onClose={onClose} />);

    await waitFor(() => expect(document.querySelector(".text-preview-modal__plain")).toHaveTextContent(/hello\s+world/));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("renders markdown headings, lists, code, and safe links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("# Notes\n\n- **Ready**\n\n`code` [Open](https://example.com)\n\n```\nconst ok = true;\n```", { status: 200 }));
    render(<TextPreviewModal name="README.md" source="/d/README.md" kind="markdown" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument());
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("const ok = true;")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "https://example.com");
  });

  it("uses the browser PDF viewer for PDF files", () => {
    render(<TextPreviewModal name="guide.pdf" source="/d/guide.pdf" kind="pdf" onClose={vi.fn()} />);
    expect(screen.getByTitle("guide.pdf PDF preview")).toHaveAttribute("src", "/d/guide.pdf");
  });
});
