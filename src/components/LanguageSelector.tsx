import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supportedLanguages, type SupportedLanguage } from "../i18n";

export function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const language: SupportedLanguage = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";
  return (
    <label className="language-selector">
      <Languages size={17} aria-hidden="true" />
      <span>{t("settings.language")}</span>
      <select value={language} onChange={(event) => void i18n.changeLanguage(event.target.value)} aria-label={t("settings.language")}>
        {supportedLanguages.map((value) => <option value={value} key={value}>{value === "en" ? "English" : "简体中文"}</option>)}
      </select>
    </label>
  );
}
