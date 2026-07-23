import { FormEvent, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, LockKeyhole, X } from "lucide-react";

interface LoginDialogProps {
  busy: boolean;
  error: string;
  needsOtp: boolean;
  onClose: () => void;
  onSubmit: (username: string, password: string, otp: string) => void;
}

export function LoginDialog({ busy, error, needsOtp, onClose, onSubmit }: LoginDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  useEscape(onClose);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(username.trim(), password, otp.trim());
  };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="icon-button dialog__close" onClick={onClose} title="Close"><X size={20} /></button>
        <div className="dialog__icon"><KeyRound size={24} /></div>
        <h2 id="login-title">Sign in to OpenList</h2>
        <p>Use your OpenList account to access private files.</p>
        <form onSubmit={submit}>
          <label>Username<input autoFocus required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {needsOtp && <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} /></label>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button dialog__submit" disabled={busy} type="submit">
            {busy && <LoaderCircle className="spin" size={17} />} Sign in
          </button>
        </form>
      </section>
    </div>
  );
}

interface PasswordDialogProps {
  path: string;
  onClose: () => void;
  onSubmit: (password: string) => void;
}

export function PasswordDialog({ path, onClose, onSubmit }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="password-title">
        <button className="icon-button dialog__close" onClick={onClose} title="Close"><X size={20} /></button>
        <div className="dialog__icon dialog__icon--amber"><LockKeyhole size={24} /></div>
        <h2 id="password-title">Folder password</h2>
        <p>Enter the password for <strong>{path}</strong>.</p>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
          <label>Password<input autoFocus required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary-button dialog__submit" type="submit">Unlock folder</button>
        </form>
      </section>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
}
