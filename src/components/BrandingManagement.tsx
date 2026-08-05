import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Globe2, Image, LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError, deleteBrandingAsset, updateFrontendBranding, uploadBrandingAsset } from "../lib/api";
import { validateCustomImage } from "../lib/customization";
import type { BrandingAssetKind, FrontendBranding } from "../lib/types";

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

interface AssetEditorProps {
  kind: BrandingAssetKind;
  currentUrl: string;
  file: File | null;
  removed: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}

function AssetEditor({ kind, currentUrl, file, removed, disabled, onFile, onRemove }: AssetEditorProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useObjectUrl(file);
  const preview = objectUrl || (!removed ? currentUrl : "");
  return (
    <section className="branding-asset" aria-labelledby={`branding-${kind}-title`}>
      <div className={`branding-asset__preview branding-asset__preview--${kind}`}>
        {preview ? <img src={preview} alt="" /> : kind === "logo" ? <Image size={30} /> : <Globe2 size={28} />}
      </div>
      <div className="branding-asset__copy">
        <strong id={`branding-${kind}-title`}>{t(kind === "logo" ? "branding.logo" : "branding.webIcon")}</strong>
        <span>{t(kind === "logo" ? "branding.logoHint" : "branding.iconHint")}</span>
      </div>
      <input ref={inputRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) onFile(selected); event.target.value = ""; }} />
      <div className="branding-asset__actions">
        <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()} disabled={disabled}><Upload size={16} />{preview ? t("branding.replace") : t("branding.choose")}</button>
        {preview && <button className="icon-button danger-button" type="button" onClick={onRemove} disabled={disabled} title={t("branding.remove")}><Trash2 size={17} /></button>}
      </div>
    </section>
  );
}

export function BrandingManagement({ branding, onUpdated }: { branding: FrontendBranding; onUpdated: (branding: FrontendBranding) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(branding.name);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => setName(branding.name), [branding.name]);

  const selectAsset = (kind: BrandingAssetKind, file: File) => {
    const validation = validateCustomImage(file);
    if (validation) {
      setError(t(validation === "size" ? "profile.imageTooLarge" : "profile.invalidImageType"));
      return;
    }
    setError("");
    if (kind === "logo") {
      setLogoFile(file);
      setRemoveLogo(false);
    } else {
      setIconFile(file);
      setRemoveIcon(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("branding.nameRequired"));
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let updated = await updateFrontendBranding(name.trim());
      if (removeLogo) updated = await deleteBrandingAsset("logo");
      if (logoFile) updated = await uploadBrandingAsset("logo", logoFile);
      if (removeIcon) updated = await deleteBrandingAsset("icon");
      if (iconFile) updated = await uploadBrandingAsset("icon", iconFile);
      setLogoFile(null);
      setIconFile(null);
      setRemoveLogo(false);
      setRemoveIcon(false);
      setMessage(t("branding.saved"));
      onUpdated(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("branding.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-section" aria-labelledby="branding-title">
      <div className="admin-heading">
        <div><p className="admin-eyebrow">{t("branding.eyebrow")}</p><h1 id="branding-title">{t("branding.title")}</h1><p>{t("branding.subtitle")}</p></div>
      </div>
      {message && <div className="admin-banner admin-banner--success" role="status"><CheckCircle2 size={19} /><span>{message}</span></div>}
      {error && <div className="admin-banner admin-banner--error" role="alert"><span>{error}</span></div>}
      <form className="branding-form" onSubmit={(event) => void save(event)}>
        <label className="form-field branding-name"><span>{t("branding.frontendName")}</span><input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="branding-assets">
          <AssetEditor kind="logo" currentUrl={branding.logoUrl} file={logoFile} removed={removeLogo} disabled={saving} onFile={(file) => selectAsset("logo", file)} onRemove={() => { setLogoFile(null); setRemoveLogo(true); }} />
          <AssetEditor kind="icon" currentUrl={branding.iconUrl} file={iconFile} removed={removeIcon} disabled={saving} onFile={(file) => selectAsset("icon", file)} onRemove={() => { setIconFile(null); setRemoveIcon(true); }} />
        </div>
        <footer className="branding-form__footer"><button className="primary-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{t(saving ? "branding.saving" : "branding.save")}</button></footer>
      </form>
    </section>
  );
}
