// Type-safe bridge to the Electron preload API

export interface SnapLinkAPI {
  // Settings
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;

  // Uploads
  getUploadHistory: (limit: number) => Promise<RecentUpload[]>;
  deleteUpload: (
    id: string
  ) => Promise<{ success: boolean; error?: string }>;
  uploadFile: (filepath: string) => Promise<UploadResult>;
  uploadClipboard: () => Promise<UploadResult>;

  // Events
  onUploadStart: (
    cb: (data: { filepath: string }) => void
  ) => () => void;
  onUploadComplete: (
    cb: (data: { id: string; url: string; filepath: string }) => void
  ) => () => void;
  onUploadError: (
    cb: (err: { code: string; message: string }) => void
  ) => () => void;

  // Auth
  loginWithBrowser: () => Promise<{ sessionId: string }>;
  logout: () => Promise<{ success: boolean }>;

  // System
  openUrl: (url: string) => Promise<void>;
  showItemInFolder: (filepath: string) => Promise<void>;
  platform: string;
  version: string;
}

export interface AppSettings {
  enabled: boolean;
  autoStart: boolean;
  watchPaths: string[];
  copyFormat: "url" | "markdown" | "html";
  autoUpload: boolean;
  uploadNotification: boolean;
  defaultBurnAfterRead: boolean;
  defaultExpiresIn: "never" | "1h" | "1d" | "7d" | "30d";
  stripExifMetadata: boolean;
  ocrEnabled: boolean;
  ocrLanguages: string[];
  hotkeys: {
    uploadClipboard: string;
    toggleHistory: string;
    togglePause: string;
  };
  deviceToken: string | null;
  userEmail: string | null;
  plan: "free" | "pro" | "team" | "enterprise";
  uploadEndpoint: string;
  analyticsOptIn: boolean;
  telemetryOptIn: boolean;
}

export interface UploadResult {
  id: string;
  url: string;
  rawUrl: string;
  markdown: string;
  html: string;
  expiresAt: string | null;
  burnAfterRead: boolean;
  ocrStatus: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface RecentUpload {
  id: string;
  url: string;
  filepath?: string;
  createdAt: string;
}

declare global {
  interface Window {
    snaplink: SnapLinkAPI;
  }
}

export function getAPI(): SnapLinkAPI {
  if (!window.snaplink) {
    // Development fallback — when running without Electron
    console.warn("SnapLink API not available. Running in browser dev mode.");
    return createMockAPI();
  }
  return window.snaplink;
}

function createMockAPI(): SnapLinkAPI {
  return {
    getSettings: async () => ({
      enabled: true,
      autoStart: false,
      watchPaths: [],
      copyFormat: "url" as const,
      autoUpload: true,
      uploadNotification: true,
      defaultBurnAfterRead: false,
      defaultExpiresIn: "never" as const,
      stripExifMetadata: true,
      ocrEnabled: true,
      ocrLanguages: ["eng"],
      hotkeys: {
        uploadClipboard: "CmdOrCtrl+Shift+V",
        toggleHistory: "CmdOrCtrl+Shift+H",
        togglePause: "CmdOrCtrl+Shift+P",
      },
      deviceToken: null,
      userEmail: null,
      plan: "free" as const,
      uploadEndpoint: "http://localhost:3456",
      analyticsOptIn: false,
      telemetryOptIn: false,
    }),
    updateSettings: async (patch) => ({ ...(await createMockAPI().getSettings()), ...patch } as AppSettings),
    getUploadHistory: async () => [],
    deleteUpload: async () => ({ success: true }),
    uploadFile: async () => ({
      id: "mock",
      url: "https://snp.ink/mock",
      rawUrl: "https://snp.ink/raw/mock",
      markdown: "![](https://snp.ink/mock)",
      html: '<img src="https://snp.ink/mock" />',
      expiresAt: null,
      burnAfterRead: false,
      ocrStatus: "skipped",
      size: 0,
      width: null,
      height: null,
    }),
    uploadClipboard: async () => ({
      id: "mock",
      url: "https://snp.ink/mock",
      rawUrl: "https://snp.ink/raw/mock",
      markdown: "![](https://snp.ink/mock)",
      html: '<img src="https://snp.ink/mock" />',
      expiresAt: null,
      burnAfterRead: false,
      ocrStatus: "skipped",
      size: 0,
      width: null,
      height: null,
    }),
    onUploadStart: () => () => {},
    onUploadComplete: () => () => {},
    onUploadError: () => () => {},
    loginWithBrowser: async () => ({ sessionId: "mock" }),
    logout: async () => ({ success: true }),
    openUrl: async () => {},
    showItemInFolder: async () => {},
    platform: "darwin",
    version: "1.0.0-dev",
  };
}
