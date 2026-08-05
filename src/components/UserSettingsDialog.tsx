import { useEffect, useRef, useState } from "react";
import { Camera, Check, Languages, LoaderCircle, LogIn, LogOut, MonitorCog, Palette, Trash2, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError, deleteUserAvatar, uploadUserAvatar } from "../lib/api";
import { validateCustomImage } from "../lib/customization";
import type { ThemePreset } from "../lib/theme";
import type { OpenListUser, UserProfile } from "../lib/types";
import { UserAvatar } from "./UserAvatar";

export type SettingsSection = "profile" | "language" | "appearance";

interface UserSettingsDialogProps {
  user: OpenListUser | null;
  profile: UserProfile;
  theme: ThemePreset;
  initialSection: SettingsSection;
  onThemeChange: (theme: ThemePreset) => void;
  onProfileUpdated: (profile: UserProfile) => void;
  onLogin: () => void;
  onLogout: () => void;
  onClose: () => void;
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

const themeOptions: Array<{ id: ThemePreset; icon: typeof Palette }> = [
  { id: "icloud", icon: Palette },
  { id: "explorer", icon: MonitorCog },
  { id: "notion", icon: Check },
];

export function UserSettingsDialog({
  user,
  profile,
  theme,
  initialSection,
  onThemeChange,
  onProfileUpdated,
  onLogin,
  onLogout,
  onClose,
}: UserSettingsDialogProps) {
  const { i18n, t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [file, setFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const previewUrl = useObjectUrl(file);
  const avatarUrl = previewUrl || (!removeAvatar ? profile.avatarUrl : "");
  const language = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, saving]);

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    const validation = validateCustomImage(selected);
    if (validation) {
      setError(t(validation === "size" ? "profile.imageTooLarge" : "profile.invalidImageType"));
      return;
    }
    setError("");
    setMessage("");
    setFile(selected);
    setRemoveAvatar(false);
  };

  const saveProfile = async () => {
    if (!file && !removeAvatar) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = file ? await uploadUserAvatar(file) : await deleteUserAvatar();
      setFile(null);
      setRemoveAvatar(false);
      setMessage(t("profile.updated"));
      onProfileUpdated(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: SettingsSection; icon: typeof UserRound }> = [
    { id: "profile", icon: UserRound },
    { id: "language", icon: Languages },
    { id: "appearance", icon: Palette },
  ];

  return (
    <div className="dialog-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-dialog__header">
          <div><SettingsIcon /><h2 id="settings-title">{t("settings.title")}</h2></div>
          <button className="icon-button" onClick={onClose} disabled={saving} title={t("common.close")}><X size={20} /></button>
        </header>
        <div className="settings-dialog__layout">
          <nav className="settings-dialog__nav" aria-label={t("settings.title")}>
            {tabs.map(({ id, icon: Icon }) => (
              <button key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setError(""); setMessage(""); }} aria-current={section === id ? "page" : undefined}>
                <Icon size={18} /><span>{t(`settings.${id}`)}</span>
              </button>
            ))}
          </nav>
          <div className="settings-dialog__content">
            {section === "profile" && (
              <section className="settings-pane" aria-labelledby="settings-profile-title">
                <div className="settings-pane__heading"><h3 id="settings-profile-title">{t("settings.profile")}</h3>{user && <span>{user.username}</span>}</div>
                {user ? (
                  <>
                    <div className="profile-avatar-editor">
                      <UserAvatar avatarUrl={avatarUrl} username={user.username} />
                      <input ref={inputRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
                      <div className="profile-avatar-editor__actions">
                        <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()} disabled={saving}><Camera size={17} />{profile.avatarUrl || file ? t("profile.replaceAvatar") : t("profile.chooseAvatar")}</button>
                        {(profile.avatarUrl || file) && <button className="icon-button danger-button" type="button" onClick={() => { setFile(null); setRemoveAvatar(true); setError(""); setMessage(""); }} disabled={saving} title={t("profile.removeAvatar")}><Trash2 size={18} /></button>}
                      </div>
                    </div>
                    {message && <div className="form-success" role="status"><Check size={16} />{message}</div>}
                    {error && <div className="form-error" role="alert">{error}</div>}
                    <footer className="settings-pane__footer">
                      <button className="secondary-button profile-sign-out" type="button" onClick={onLogout} disabled={saving}><LogOut size={17} />{t("profile.signOut")}</button>
                      <button className="primary-button" type="button" onClick={() => void saveProfile()} disabled={saving || (!file && !removeAvatar)}>{saving && <LoaderCircle className="spin" size={17} />}{t("profile.save")}</button>
                    </footer>
                  </>
                ) : (
                  <div className="settings-sign-in"><UserRound size={38} /><p>{t("profile.signInRequired")}</p><button className="primary-button" onClick={onLogin}><LogIn size={17} />{t("profile.signIn")}</button></div>
                )}
              </section>
            )}

            {section === "language" && (
              <section className="settings-pane" aria-labelledby="settings-language-title">
                <div className="settings-pane__heading"><h3 id="settings-language-title">{t("settings.language")}</h3></div>
                <div className="settings-option-list" role="radiogroup" aria-label={t("settings.language")}>
                  <button className={language === "en" ? "selected" : ""} role="radio" aria-checked={language === "en"} onClick={() => void i18n.changeLanguage("en")}><span><strong>English</strong><small>English</small></span>{language === "en" && <Check size={18} />}</button>
                  <button className={language === "zh-CN" ? "selected" : ""} role="radio" aria-checked={language === "zh-CN"} onClick={() => void i18n.changeLanguage("zh-CN")}><span><strong>简体中文</strong><small>Chinese (Simplified)</small></span>{language === "zh-CN" && <Check size={18} />}</button>
                </div>
              </section>
            )}

            {section === "appearance" && (
              <section className="settings-pane" aria-labelledby="settings-appearance-title">
                <div className="settings-pane__heading"><h3 id="settings-appearance-title">{t("settings.appearance")}</h3></div>
                <div className="theme-options" role="radiogroup" aria-label={t("settings.appearance")}>
                  {themeOptions.map(({ id, icon: Icon }) => (
                    <button className={`theme-option${theme === id ? " selected" : ""}`} key={id} role="radio" aria-checked={theme === id} onClick={() => onThemeChange(id)}>
                      <span className={`theme-option__preview theme-option__preview--${id}`} aria-hidden="true"><i /><b /><em /><small /></span>
                      <span className="theme-option__label"><Icon size={17} /><strong>{t(`themes.${id}`)}</strong>{theme === id && <Check size={17} />}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsIcon() {
  return <span className="settings-dialog__icon"><Palette size={20} /></span>;
}
