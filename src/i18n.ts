import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const supportedLanguages = ["en", "zh-CN"] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

const resources = {
  en: {
    translation: {
      nav: { files: "My files", settings: "Settings" },
      common: { cancel: "Cancel", close: "Close", clear: "Clear", refresh: "Refresh", upload: "Upload", search: "Search", language: "Language" },
      files: {
        searchCurrent: "Search in {{name}}",
        advancedSearch: "Advanced search",
        copyLink: "Copy link",
        linkCopied: "Direct link copied.",
      },
      settings: { language: "Language", storage: "Storage", users: "Users", native: "Native Management" },
      search: {
        title: "Advanced search",
        description: "Search indexed files and refine the matching results.",
        name: "Name", type: "Type", location: "Location", modified: "Date modified", size: "Size", from: "From", to: "To", minimum: "Minimum", maximum: "Maximum",
        all: "All items", folder: "Folder", image: "Image", video: "Video", document: "Document", audio: "Audio", archive: "Archive", other: "Other",
        run: "Search", reset: "Reset", noResults: "No indexed items match these filters.", resultCount: "{{count}} result", resultCount_other: "{{count}} results", openLocation: "Open location",
      },
      upload: { uploading: "Uploading {{count}} file", uploading_other: "Uploading {{count}} files", complete: "Uploads complete", clearCompleted: "Clear completed uploads", minimize: "Minimize upload manager", expand: "Expand upload manager", uploaded: "Uploaded", cancelled: "Cancelled", failed: "Upload failed" },
    },
  },
  "zh-CN": {
    translation: {
      nav: { files: "我的文件", settings: "设置" },
      common: { cancel: "取消", close: "关闭", clear: "清除", refresh: "刷新", upload: "上传", search: "搜索", language: "语言" },
      files: {
        searchCurrent: "在 {{name}} 中搜索",
        advancedSearch: "高级搜索",
        copyLink: "复制直链",
        linkCopied: "直链已复制。",
      },
      settings: { language: "语言", storage: "存储", users: "用户", native: "原生管理" },
      search: {
        title: "高级搜索",
        description: "搜索已建立索引的文件，并进一步筛选结果。",
        name: "名称", type: "类型", location: "位置", modified: "修改日期", size: "大小", from: "开始", to: "结束", minimum: "最小值", maximum: "最大值",
        all: "所有项目", folder: "文件夹", image: "图片", video: "视频", document: "文档", audio: "音频", archive: "压缩包", other: "其他",
        run: "搜索", reset: "重置", noResults: "没有已建立索引的项目符合这些筛选条件。", resultCount: "{{count}} 个结果", resultCount_other: "{{count}} 个结果", openLocation: "打开位置",
      },
      upload: { uploading: "正在上传 {{count}} 个文件", uploading_other: "正在上传 {{count}} 个文件", complete: "上传完成", clearCompleted: "清除已完成上传", minimize: "最小化上传管理器", expand: "展开上传管理器", uploaded: "已上传", cancelled: "已取消", failed: "上传失败" },
    },
  },
} as const;

const storedLanguage = localStorage.getItem("openlist-drive-language");
const initialLanguage: SupportedLanguage = storedLanguage === "zh-CN" ? "zh-CN" : "en";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  if (supportedLanguages.includes(language as SupportedLanguage)) localStorage.setItem("openlist-drive-language", language);
});

export default i18n;
