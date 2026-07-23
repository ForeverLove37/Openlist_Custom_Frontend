import { describe, expect, it } from "vitest";
import { emptyUserForm, hasPermission, setPermission, userFromForm, userToForm } from "./users";
import type { ManagedUser } from "./types";

const user: ManagedUser = {
  id: 8,
  username: "alex",
  base_path: "/Team",
  role: 0,
  disabled: false,
  permission: 1 << 3,
  allow_ldap: true,
};

describe("user form helpers", () => {
  it("starts new users with the safe general-user defaults", () => {
    expect(emptyUserForm()).toMatchObject({ basePath: "/", permission: 0, allowLdap: true });
  });

  it("keeps WebDAV write dependent on WebDAV read", () => {
    const writeEnabled = setPermission(0, 9, true);
    expect(hasPermission(writeEnabled, 8)).toBe(true);
    expect(hasPermission(writeEnabled, 9)).toBe(true);
    const readDisabled = setPermission(writeEnabled, 8, false);
    expect(hasPermission(readDisabled, 8)).toBe(false);
    expect(hasPermission(readDisabled, 9)).toBe(false);
  });

  it("preserves immutable user fields while sending a normalized edit payload", () => {
    const values = userToForm(user);
    values.basePath = "Team/New";
    values.password = "new-password";
    expect(userFromForm(values, user)).toMatchObject({
      id: 8,
      username: "alex",
      base_path: "/Team/New",
      role: 0,
      password: "new-password",
    });
  });
});
