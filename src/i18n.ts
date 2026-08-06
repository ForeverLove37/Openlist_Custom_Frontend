import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const supportedLanguages = ["en", "zh-CN"] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

const resources = {
  en: {
    translation: {
      nav: { files: "My files", settings: "Settings", administration: "Administration" },
      common: { cancel: "Cancel", close: "Close", clear: "Clear", refresh: "Refresh", upload: "Upload", search: "Search", language: "Language" },
      preview: { pdf: "PDF preview", text: "Text preview", markdown: "Markdown preview", loading: "Loading preview", unavailable: "This file could not be previewed.", download: "Download file" },
      files: {
        searchCurrent: "Search in {{name}}",
        advancedSearch: "Advanced search",
        copyLink: "Copy link",
        linkCopied: "Direct link copied.",
        refreshedSuccessfully: "Refreshed successfully.",
      },
      settings: { title: "Settings", loading: "Opening settings", profile: "Profile", language: "Language", appearance: "Appearance", storage: "Storage", users: "Users", branding: "Branding", native: "Native Management" },
      profile: {
        title: "Profile", chooseAvatar: "Choose avatar", replaceAvatar: "Replace avatar", removeAvatar: "Remove avatar", save: "Save", signOut: "Sign out",
        invalidImageType: "Use a PNG, JPEG, WebP, or GIF image.", imageTooLarge: "Images must be 5 MB or smaller.", saveFailed: "Could not update your avatar.", updated: "Profile updated.", signIn: "Sign in", signInRequired: "Sign in to manage your profile.",
      },
      themes: { icloud: "iCloud", explorer: "Windows Explorer", notion: "Notion AI" },
      branding: {
        eyebrow: "Appearance", title: "Frontend branding", subtitle: "Identity used across this custom file browser.", frontendName: "Frontend name", logo: "Logo", webIcon: "Web icon",
        logoHint: "Used in the sidebar and mobile header.", iconHint: "Used in browser tabs and bookmarks.", choose: "Choose image", replace: "Replace", remove: "Remove", save: "Save branding", saving: "Saving", saved: "Branding saved.", nameRequired: "Frontend name is required.", saveFailed: "Could not save frontend branding.",
      },
      search: {
        title: "Advanced search",
        description: "Search indexed files and refine the matching results.",
        name: "Name", type: "Type", location: "Location", modified: "Date modified", size: "Size", from: "From", to: "To", minimum: "Minimum", maximum: "Maximum",
        all: "All items", folder: "Folder", image: "Image", video: "Video", document: "Document", audio: "Audio", archive: "Archive", other: "Other",
        run: "Search", reset: "Reset", noResults: "No indexed items match these filters.", resultCount: "{{count}} result", resultCount_other: "{{count}} results", openLocation: "Open location",
      },
      upload: { title: "Upload files", description: "Add files to {{path}}", dropHint: "Drag and drop files here", dropActive: "Release to start uploading", dropSupport: "You can also choose files from your device", chooseFiles: "Choose files", uploading: "Uploading {{count}} file", uploading_other: "Uploading {{count}} files", complete: "Uploads complete", clearCompleted: "Clear completed uploads", minimize: "Minimize upload manager", expand: "Expand upload manager", uploaded: "Uploaded", cancelled: "Cancelled", failed: "Upload failed" },
    },
  },
  "zh-CN": {
    translation: {
      nav: { files: "我的文件", settings: "设置", administration: "管理后台" },
      common: { cancel: "取消", close: "关闭", clear: "清除", refresh: "刷新", upload: "上传", search: "搜索", language: "语言" },
      preview: { pdf: "PDF 预览", text: "文本预览", markdown: "Markdown 预览", loading: "正在加载预览", unavailable: "无法预览此文件。", download: "下载文件" },
      files: {
        searchCurrent: "在 {{name}} 中搜索",
        advancedSearch: "高级搜索",
        copyLink: "复制直链",
        linkCopied: "直链已复制。",
        refreshedSuccessfully: "刷新成功。",
      },
      settings: { title: "设置", loading: "正在打开设置", profile: "个人资料", language: "语言", appearance: "外观", storage: "存储", users: "用户", branding: "品牌设置", native: "原生管理" },
      profile: {
        title: "个人资料", chooseAvatar: "选择头像", replaceAvatar: "更换头像", removeAvatar: "移除头像", save: "保存", signOut: "退出登录",
        invalidImageType: "请使用 PNG、JPEG、WebP 或 GIF 图片。", imageTooLarge: "图片大小不能超过 5 MB。", saveFailed: "无法更新头像。", updated: "个人资料已更新。", signIn: "登录", signInRequired: "登录后即可管理个人资料。",
      },
      themes: { icloud: "iCloud", explorer: "Windows 资源管理器", notion: "Notion AI" },
      branding: {
        eyebrow: "外观", title: "前端品牌设置", subtitle: "设置此自定义文件浏览器中显示的品牌标识。", frontendName: "前端名称", logo: "Logo", webIcon: "网页图标",
        logoHint: "显示在侧边栏和移动端顶部。", iconHint: "显示在浏览器标签页和书签中。", choose: "选择图片", replace: "更换", remove: "移除", save: "保存品牌设置", saving: "正在保存", saved: "品牌设置已保存。", nameRequired: "前端名称不能为空。", saveFailed: "无法保存前端品牌设置。",
      },
      search: {
        title: "高级搜索",
        description: "搜索已建立索引的文件，并进一步筛选结果。",
        name: "名称", type: "类型", location: "位置", modified: "修改日期", size: "大小", from: "开始", to: "结束", minimum: "最小值", maximum: "最大值",
        all: "所有项目", folder: "文件夹", image: "图片", video: "视频", document: "文档", audio: "音频", archive: "压缩包", other: "其他",
        run: "搜索", reset: "重置", noResults: "没有已建立索引的项目符合这些筛选条件。", resultCount: "{{count}} 个结果", resultCount_other: "{{count}} 个结果", openLocation: "打开位置",
      },
      upload: { title: "上传文件", description: "将文件添加到 {{path}}", dropHint: "将文件拖拽到这里", dropActive: "松开鼠标开始上传", dropSupport: "也可以从设备中选择文件", chooseFiles: "选择文件", uploading: "正在上传 {{count}} 个文件", uploading_other: "正在上传 {{count}} 个文件", complete: "上传完成", clearCompleted: "清除已完成上传", minimize: "最小化上传管理器", expand: "展开上传管理器", uploaded: "已上传", cancelled: "已取消", failed: "上传失败" },
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
