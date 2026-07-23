import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ApiError, createUser, deleteUser, getUser, listUsers, updateUser } from "../lib/api";
import {
  ADMIN_ROLE,
  GUEST_ROLE,
  USER_PERMISSIONS,
  emptyUserForm,
  hasPermission,
  roleName,
  setPermission,
  userFromForm,
  userToForm,
} from "../lib/users";
import type { ManagedUser, UserFormValues } from "../lib/types";

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formUser, setFormUser] = useState<ManagedUser | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const page = await listUsers(signal);
      setUsers(page.content ?? []);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof ApiError ? reason.message : "Could not load user accounts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const edit = async (user: ManagedUser) => {
    setActionId(user.id);
    setError("");
    try {
      setFormUser(await getUser(user.id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not load this account.");
    } finally {
      setActionId(null);
    }
  };

  const save = async (values: UserFormValues) => {
    const existing = formUser ?? undefined;
    const payload = userFromForm(values, existing);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (existing) await updateUser(payload);
      else await createUser(payload);
      setFormUser(undefined);
      setMessage(`${payload.username} was ${existing ? "updated" : "created"}.`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    setError("");
    try {
      await deleteUser(deleteTarget.id);
      setMessage(`${deleteTarget.username} was deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not delete this account.");
    } finally {
      setActionId(null);
    }
  };

  return (
    <section className="admin-section" aria-labelledby="users-title">
      <div className="admin-heading">
        <div>
          <p className="admin-eyebrow">Administration</p>
          <h1 id="users-title">Users</h1>
          <p>{loading ? "Loading accounts" : `${users.length} ${users.length === 1 ? "account" : "accounts"}`}</p>
        </div>
        <div className="admin-heading__actions">
          <button className="icon-button bordered-button" onClick={() => void load()} disabled={loading} title="Refresh users"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
          <button className="primary-button" onClick={() => setFormUser(null)}><UserPlus size={18} /> Add user</button>
        </div>
      </div>

      {message && <Banner tone="success" text={message} onDismiss={() => setMessage("")} />}
      {error && <Banner tone="error" text={error} onDismiss={() => setError("")} />}

      {loading && users.length === 0 ? <UserLoading /> : users.length === 0 && !error ? (
        <div className="storage-empty">
          <Users size={38} />
          <h2>No user accounts</h2>
          <p>Create a user account to give someone access to a chosen OpenList path.</p>
          <button className="primary-button" onClick={() => setFormUser(null)}><UserPlus size={18} /> Add user</button>
        </div>
      ) : (
        <div className="user-list">
          <div className="user-list__header" aria-hidden="true"><span>User</span><span>Role</span><span>Base path</span><span>Access</span><span>Actions</span></div>
          {users.map((user) => {
            const busy = actionId === user.id;
            const protectedUser = user.role === ADMIN_ROLE || user.role === GUEST_ROLE;
            return (
              <article className="user-row" key={user.id}>
                <div className="user-identity"><span className="user-avatar"><UserCog size={20} /></span><span><strong>{user.username}</strong><small>{user.disabled ? "Disabled" : "Active"}</small></span></div>
                <div className="user-cell" data-label="Role"><span className={`role-badge role-badge--${user.role === ADMIN_ROLE ? "admin" : user.role === GUEST_ROLE ? "guest" : "user"}`}>{roleName(user.role)}</span></div>
                <div className="user-cell user-base-path" data-label="Base path"><span title={user.base_path}>{user.base_path || "/"}</span></div>
                <div className="user-cell user-permissions" data-label="Access"><span>{accessSummary(user)}</span></div>
                <div className="user-actions">
                  <button className="icon-button subtle-button" onClick={() => void edit(user)} disabled={busy} title={`Edit ${user.username}`}>{busy ? <LoaderCircle className="spin" size={18} /> : <Pencil size={18} />}</button>
                  <button className="icon-button danger-button" onClick={() => setDeleteTarget(user)} disabled={busy || protectedUser} title={protectedUser ? `${roleName(user.role)} accounts cannot be deleted` : `Delete ${user.username}`}><Trash2 size={18} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formUser !== undefined && <UserForm existing={formUser ?? undefined} saving={saving} onClose={() => setFormUser(undefined)} onSave={save} />}
      {deleteTarget && <ConfirmDeleteUser user={deleteTarget} busy={actionId === deleteTarget.id} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />}
    </section>
  );
}

function Banner({ tone, text, onDismiss }: { tone: "success" | "error"; text: string; onDismiss: () => void }) {
  return <div className={`admin-banner admin-banner--${tone}`} role={tone === "error" ? "alert" : "status"}>{tone === "error" ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{text}</span><button onClick={onDismiss} title="Dismiss"><X size={17} /></button></div>;
}

interface UserFormProps {
  existing?: ManagedUser;
  saving: boolean;
  onClose: () => void;
  onSave: (values: UserFormValues) => Promise<void>;
}

export function UserForm({ existing, saving, onClose, onSave }: UserFormProps) {
  const [values, setValues] = useState<UserFormValues>(() => existing ? userToForm(existing) : emptyUserForm());
  const [error, setError] = useState("");
  const editing = Boolean(existing);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, saving]);

  const set = <K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!editing && !values.password) {
      setError("A password is required for a new user.");
      return;
    }
    setError("");
    try {
      await onSave(values);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not save this account.");
    }
  };

  return (
    <div className="dialog-backdrop storage-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="storage-dialog user-dialog" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
        <header className="storage-dialog__header">
          <div><span className="dialog__icon"><UserCog size={24} /></span><div><h2 id="user-form-title">{editing ? "Edit user" : "Add user"}</h2><p>{editing ? existing?.username : "Create a standard OpenList user"}</p></div></div>
          <button className="icon-button" onClick={onClose} disabled={saving} title="Close"><X size={21} /></button>
        </header>
        <form className="storage-form" onSubmit={(event) => void submit(event)}>
          <div className="form-section form-section--first">
            <h3>Account</h3>
            <div className="form-grid">
              <label className="form-field"><span>Username <b>*</b></span><input required autoComplete="username" value={values.username} onChange={(event) => set("username", event.target.value)} /></label>
              <label className="form-field"><span>Password {editing ? "(leave blank to keep)" : <b>*</b>}</span><input required={!editing} type="password" autoComplete="new-password" value={values.password} onChange={(event) => set("password", event.target.value)} /></label>
              <label className="form-field form-field--wide"><span>Base path <b>*</b></span><input required placeholder="/" value={values.basePath} onChange={(event) => set("basePath", event.target.value)} /></label>
              <label className="check-field"><input type="checkbox" checked={values.disabled} onChange={(event) => set("disabled", event.target.checked)} /><span>Disable this account</span></label>
              <label className="check-field"><input type="checkbox" checked={values.allowLdap} onChange={(event) => set("allowLdap", event.target.checked)} /><span>Allow LDAP sign-in</span></label>
            </div>
          </div>

          <div className="form-section">
            <h3>Permissions</h3>
            <div className="permission-grid">
              {USER_PERMISSIONS.map(({ bit, label }) => <label className="check-field" key={bit}><input type="checkbox" checked={hasPermission(values.permission, bit)} onChange={(event) => set("permission", setPermission(values.permission, bit, event.target.checked))} /><span>{label}</span></label>)}
            </div>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <footer className="storage-dialog__footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{editing ? "Save changes" : "Create user"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function ConfirmDeleteUser({ user, busy, onCancel, onConfirm }: { user: ManagedUser; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title"><div className="dialog__icon dialog__icon--danger"><Trash2 size={23} /></div><h2 id="delete-user-title">Delete user?</h2><p><strong>{user.username}</strong> will lose access to OpenList. Their source files will not be deleted.</p><div className="confirm-dialog__actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button className="delete-button" onClick={onConfirm} disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />} Delete user</button></div></section></div>;
}

function UserLoading() {
  return <div className="user-list storage-list--loading" aria-label="Loading users">{Array.from({ length: 3 }, (_, index) => <div className="user-row" key={index}><span className="skeleton storage-loading-icon" /><span className="skeleton storage-loading-line" /></div>)}</div>;
}

function accessSummary(user: ManagedUser) {
  if (user.role === ADMIN_ROLE) return "Full access";
  const capabilities = [];
  if (hasPermission(user.permission, 3)) capabilities.push("Upload");
  if (hasPermission(user.permission, 8)) capabilities.push("WebDAV");
  return capabilities.length ? capabilities.join(" · ") : "Read only";
}
