// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageForm } from "./StorageManagement";

afterEach(cleanup);

describe("StorageForm", () => {
  it("switches from Local fields to WebDAV fields and submits dynamic values", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StorageForm saving={false} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.getByLabelText(/Root folder path in container/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/WebDAV URL/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /WebDAV/ }));
    fireEvent.change(screen.getByLabelText(/Mount path/), { target: { value: "/Remote" } });
    fireEvent.change(screen.getByLabelText(/WebDAV URL/), { target: { value: "https://dav.example.com" } });
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "alex" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      driver: "WebDav",
      mountPath: "/Remote",
      address: "https://dav.example.com",
      username: "alex",
      password: "secret",
      rootFolderPath: "/",
    });
  });

  it("does not submit an unsafe relative Local container root", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StorageForm saving={false} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/Mount path/), { target: { value: "/Local" } });
    fireEvent.change(screen.getByLabelText(/Root folder path in container/), {
      target: { value: "data" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    expect(
      await screen.findByText("Local root folder must be an absolute container path."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
