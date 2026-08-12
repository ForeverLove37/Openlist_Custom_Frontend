import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles.css";
import { applyTheme, readStoredTheme } from "./lib/theme";

if (navigator.userAgent.includes("OpenListDriveAndroid/")) {
  document.documentElement.dataset.androidApp = "true";
}

applyTheme(readStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
