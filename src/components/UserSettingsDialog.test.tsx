// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { OpenListUser } from "../lib/types";
import { UserSettingsDialog } from "./UserSettingsDialog";

const apiMocks = vi.hoisted(() => ({
  deleteUserAvatar: vi.fn(),
  uploadUserAvatar: vi.fn(),
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/api")>(),
  ...apiMocks,
}));

const user: OpenListUser = {
  id: 9,
  username: "alex",
  role: 0,
  disabled: false,
  base_path: "/",
  permission: 0,
};

const defaultProps = {
  user,
  profile: { avatarUrl: "/api/custom/profile/avatar?v=1" },
  theme: "icloud" as const,
  initialSection: "profile" as const,
  onThemeChange: vi.fn(),
  onProfileUpdated: vi.fn(),
  onLogin: vi.fn(),
  onLogout: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});

afterEach(cleanup);

describe("UserSettingsDialog", () => {
  it("integrates profile, language, and appearance controls", async () => {
    const onThemeChange = vi.fn();
    const { container } = render(<UserSettingsDialog {...defaultProps} onThemeChange={onThemeChange} />);

    expect(container.querySelector(".account-avatar img")).toHaveAttribute("src", defaultProps.profile.avatarUrl);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    fireEvent.click(screen.getByRole("radio", { name: "Windows Explorer" }));
    expect(onThemeChange).toHaveBeenCalledWith("explorer");

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("radio", { name: /简体中文/ }));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("zh-CN"));
  });

  it("removes the signed-in user's avatar from the profile pane", async () => {
    apiMocks.deleteUserAvatar.mockResolvedValue({ avatarUrl: "" });
    const onProfileUpdated = vi.fn();
    render(<UserSettingsDialog {...defaultProps} onProfileUpdated={onProfileUpdated} />);

    fireEvent.click(screen.getByTitle("Remove avatar"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.deleteUserAvatar).toHaveBeenCalledTimes(1));
    expect(onProfileUpdated).toHaveBeenCalledWith({ avatarUrl: "" });
  });

  it("offers sign-in from the profile pane when no account is active", () => {
    const onLogin = vi.fn();
    render(<UserSettingsDialog {...defaultProps} user={null} profile={{ avatarUrl: "" }} onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("does not close when the settings backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<UserSettingsDialog {...defaultProps} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
