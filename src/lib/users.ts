import type { ManagedUser, UserFormValues } from "./types";

export const USER_ROLE = 0;
export const GUEST_ROLE = 1;
export const ADMIN_ROLE = 2;

export const USER_PERMISSIONS = [
  { bit: 0, label: "See hidden files" },
  { bit: 1, label: "Bypass folder passwords" },
  { bit: 3, label: "Create folders and upload" },
  { bit: 4, label: "Rename files" },
  { bit: 5, label: "Move files" },
  { bit: 6, label: "Copy files" },
  { bit: 7, label: "Delete files" },
  { bit: 8, label: "WebDAV read" },
  { bit: 9, label: "WebDAV write" },
] as const;

export function hasPermission(permission: number, bit: number) {
  return (permission & (1 << bit)) !== 0;
}

export function setPermission(permission: number, bit: number, enabled: boolean) {
  const updated = enabled ? permission | (1 << bit) : permission & ~(1 << bit);
  if (bit === 8 && !enabled) return updated & ~(1 << 9);
  if (bit === 9 && enabled) return updated | (1 << 8);
  return updated;
}

export function emptyUserForm(): UserFormValues {
  return {
    username: "",
    password: "",
    basePath: "/",
    permission: 0,
    disabled: false,
    allowLdap: true,
  };
}

export function userToForm(user: ManagedUser): UserFormValues {
  return {
    username: user.username,
    password: "",
    basePath: user.base_path || "/",
    permission: user.permission ?? 0,
    disabled: user.disabled,
    allowLdap: user.allow_ldap ?? true,
  };
}

export function userFromForm(values: UserFormValues, existing?: ManagedUser): ManagedUser {
  const basePath = values.basePath.trim() || "/";
  return {
    id: existing?.id ?? 0,
    username: values.username.trim(),
    password: values.password,
    base_path: basePath.startsWith("/") ? basePath : `/${basePath}`,
    role: existing?.role ?? USER_ROLE,
    disabled: values.disabled,
    permission: values.permission,
    sso_id: existing?.sso_id ?? "",
    allow_ldap: values.allowLdap,
  };
}

export function roleName(role: number) {
  if (role === ADMIN_ROLE) return "Administrator";
  if (role === GUEST_ROLE) return "Guest";
  return "User";
}
