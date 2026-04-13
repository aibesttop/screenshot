import { create } from "zustand";
import { getAPI, AppSettings, RecentUpload } from "../lib/ipc-bridge";

interface UploadInProgress {
  filepath: string;
  startedAt: number;
}

interface AppState {
  // Settings
  settings: AppSettings | null;
  settingsLoading: boolean;

  // Uploads
  uploads: RecentUpload[];
  uploadsLoading: boolean;
  currentUpload: UploadInProgress | null;

  // UI
  currentTab: "history" | "settings" | "account";
  notification: { type: "success" | "error"; message: string } | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  loadUploads: () => Promise<void>;
  deleteUpload: (id: string) => Promise<void>;
  uploadClipboard: () => Promise<void>;
  setTab: (tab: "history" | "settings" | "account") => void;
  clearNotification: () => void;
  initEventListeners: () => () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  settingsLoading: true,
  uploads: [],
  uploadsLoading: true,
  currentUpload: null,
  currentTab: "history",
  notification: null,

  loadSettings: async () => {
    set({ settingsLoading: true });
    try {
      const api = getAPI();
      const settings = await api.getSettings();
      set({ settings, settingsLoading: false });
    } catch {
      set({ settingsLoading: false });
    }
  },

  updateSettings: async (patch) => {
    try {
      const api = getAPI();
      const settings = await api.updateSettings(patch);
      set({ settings });
    } catch {
      set({
        notification: {
          type: "error",
          message: "Failed to update settings",
        },
      });
    }
  },

  loadUploads: async () => {
    set({ uploadsLoading: true });
    try {
      const api = getAPI();
      const uploads = await api.getUploadHistory(50);
      set({ uploads, uploadsLoading: false });
    } catch {
      set({ uploadsLoading: false });
    }
  },

  deleteUpload: async (id) => {
    const api = getAPI();
    const result = await api.deleteUpload(id);
    if (result.success) {
      set((state) => ({
        uploads: state.uploads.filter((u) => u.id !== id),
      }));
    }
  },

  uploadClipboard: async () => {
    const api = getAPI();
    try {
      set({ currentUpload: { filepath: "clipboard", startedAt: Date.now() } });
      const result = await api.uploadClipboard();
      set((state) => ({
        currentUpload: null,
        uploads: [
          { id: result.id, url: result.url, createdAt: new Date().toISOString() },
          ...state.uploads,
        ],
        notification: { type: "success", message: `URL copied: ${result.url}` },
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
      set({
        currentUpload: null,
        notification: { type: "error", message },
      });
    }
  },

  setTab: (tab) => set({ currentTab: tab }),

  clearNotification: () => set({ notification: null }),

  initEventListeners: () => {
    const api = getAPI();

    const unsub1 = api.onUploadStart((data) => {
      set({
        currentUpload: { filepath: data.filepath, startedAt: Date.now() },
      });
    });

    const unsub2 = api.onUploadComplete((data) => {
      set((state) => ({
        currentUpload: null,
        uploads: [
          {
            id: data.id,
            url: data.url,
            filepath: data.filepath,
            createdAt: new Date().toISOString(),
          },
          ...state.uploads,
        ],
      }));
    });

    const unsub3 = api.onUploadError((err) => {
      set({
        currentUpload: null,
        notification: { type: "error", message: err.message },
      });
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  },
}));
