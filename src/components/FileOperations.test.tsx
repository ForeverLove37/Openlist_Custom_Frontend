// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileSelectionBar, RenameDialog } from "./FileOperations";
import { destinationError } from "../lib/files";
import type { OpenListItem } from "../lib/types";

const folder: OpenListItem = {
  name: "Projects",
  size: 0,
  is_dir: true,
  modified: "2026-01-01T00:00:00Z",
  created: "2026-01-01T00:00:00Z",
  sign: "",
  thumb: "",
  type: 1,
  hashinfo: "",
};

describe("file operations", () => {
  it("prevents recursive folder destinations", () => {
    expect(destinationError("/Team", [folder], "/Team")).toContain("other than");
    expect(destinationError("/Team", [folder], "/Team/Projects/Archive")).toContain("outside Projects");
    expect(destinationError("/Team", [folder], "/Archive")).toBe("");
  });

  it("only shows actions granted to the current user", () => {
    render(<FileSelectionBar count={2} permissions={{ rename: true, copy: true, move: false, delete: true }} onAction={vi.fn()} onClear={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /rename/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows Copy link only for one selected file", () => {
    render(<FileSelectionBar count={1} permissions={{ rename: false, copy: false, move: false, delete: false, copyLink: true }} canCopyLink onAction={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("rejects path separators before submitting a rename", () => {
    const onSubmit = vi.fn();
    render(<RenameDialog item={folder} busy={false} error="" onClose={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("New name"), { target: { value: "nested/name" } });
    fireEvent.submit(screen.getByRole("button", { name: "Rename" }).closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Names cannot be empty or contain slashes.")).toBeInTheDocument();
  });
});
