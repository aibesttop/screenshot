// ===== Upload Types =====

export interface UploadRequest {
  burnAfterRead?: boolean;
  ocr?: boolean;
  expiresIn?: "never" | "1h" | "1d" | "7d" | "30d";
  projectId?: string;
}

export interface UploadResponse {
  id: string;
  url: string;
  rawUrl: string;
  markdown: string;
  html: string;
  expiresAt: string | null;
  burnAfterRead: boolean;
  ocrStatus: OcrStatus;
  size: number;
  width: number | null;
  height: number | null;
}

export interface UploadMeta {
  id: string;
  shortId: string;
  url: string;
  rawUrl: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  ocrText: string | null;
  ocrStatus: OcrStatus;
  burnAfterRead: boolean;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

// ===== Auth Types =====

export interface DeviceAuthRequest {
  email: string;
  deviceName: string;
  platform: "darwin" | "win32" | "linux";
  appVersion: string;
}

export interface DeviceAuthResponse {
  deviceToken: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  email: string;
  plan: Plan;
}

// ===== Settings Types =====

export interface Settings {
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
    // Primary: capture a region + show the image-vs-URL picker.
    smartPaste: string;
    uploadClipboard: string;
    toggleHistory: string;
    togglePause: string;
  };

  deviceToken: string | null;
  userEmail: string | null;
  plan: Plan;

  uploadEndpoint: string;
  analyticsOptIn: boolean;
  telemetryOptIn: boolean;
}

// ===== Enums =====

export type Plan = "free" | "pro" | "team" | "enterprise";

export type OcrStatus = "skipped" | "pending" | "completed" | "failed";

// ===== IPC Types =====

export interface IPCUploadStartEvent {
  filepath: string;
}

export interface IPCUploadCompleteEvent {
  id: string;
  url: string;
  filepath: string;
}

export interface IPCUploadErrorEvent {
  code: string;
  message: string;
  filepath?: string;
}

// ===== API Error =====

export interface APIError {
  statusCode: number;
  error: string;
  message: string;
}

// ===== Pagination =====

export interface PaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}
