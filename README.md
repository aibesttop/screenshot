# SnapLink — Screenshot to URL for AI Workflows

## Complete Development Specification

> **Audience**: AI coding assistant (Claude Code / Cursor / Copilot)
> **Project**: Cross-platform desktop app for instant screenshot-to-URL
> **Platforms**: macOS + Windows + Linux (simultaneous v1 release)
> **Stack**: Web app (React) packaged with Electron
> **Style**: Imperative, unambiguous, machine-actionable

---

## 0. Executive Summary

Build a desktop utility that watches the system screenshot folder, auto-uploads new screenshots to a hosted backend, and copies a short URL to the clipboard — all within 2 seconds. The target user is a developer using AI coding tools (Claude Code, Cursor, Windsurf, ChatGPT) who needs to share visual context with AI assistants, especially in remote SSH scenarios where local clipboard doesn't bridge to the remote session.

**Product name (placeholder)**: SnapLink. Replace throughout if branded differently.

**Core promise**: Press `Cmd+Shift+4` (or Windows equivalent) → URL is in your clipboard before you can switch windows.

---

## 1. Product Scope

### 1.1 User stories (in order of priority)

1. **As an AI user on local Mac/Windows/Linux**, I take a screenshot with the OS shortcut and the URL is ready to paste into Claude/Cursor within 2 seconds.
2. **As an SSH-remote developer**, I take a screenshot locally and can paste the URL into my remote Claude Code session.
3. **As a privacy-conscious user**, I can mark a screenshot as "burn after AI reads" so it's deleted after first access.
4. **As an AI workflow user**, the uploaded screenshot has auto-OCR so I can paste "here's a screenshot with OCR text: [URL]" and AI gets both.
5. **As a team user**, I can share a project space where teammates see each other's screenshots.
6. **As a paying user**, I can use custom domains and unlimited uploads.

### 1.2 Out of scope for v1

Do NOT build these in the first release:

- Screenshot annotation/editing (arrows, blur, highlight) — this is a different product category
- Video/GIF recording — deferred to v2
- Cloud sync of screenshot history across devices — v2
- Browser extension — separate product
- Mobile apps — separate product
- Team collaboration features beyond basic shared space — v2
- AI-generated alt text / image description — v2 (OCR is in v1)
- Multi-screenshot batch upload — v1.5

### 1.3 Non-goals

- We are NOT competing with CleanShot X, ShareX, Snagit. Those are editing tools. We are a **clipboard→URL utility** optimized for AI context sharing.
- We are NOT competing with Imgur, Dropshare. Those are generic image hosts.
- We are specifically for the AI workflow user. Every feature decision should pass the test: "Does this make AI context sharing faster?"

---

## 2. Technical Stack

### 2.1 Desktop app

| Layer         | Technology                               | Reason                                    |
| ------------- | ---------------------------------------- | ----------------------------------------- |
| Shell         | **Electron** (latest stable, 30+)        | Three-platform support, mature ecosystem  |
| Renderer      | **React 18** + **TypeScript** + **Vite** | Standard web stack                        |
| UI library    | **shadcn/ui** + **Tailwind CSS**         | Modern, customizable, fits design goals   |
| State         | **Zustand**                              | Lighter than Redux, enough for this scope |
| IPC           | Electron `contextBridge` + typed IPC     | Type-safe main-renderer communication     |
| File watching | **chokidar**                             | Battle-tested file watcher                |
| Hotkeys       | Electron `globalShortcut`                | Cross-platform global hotkeys             |
| Notifications | Electron `Notification` API              | Native notifications                      |
| Packaging     | **electron-builder**                     | Best tooling for multi-platform builds    |
| Auto-update   | **electron-updater**                     | Integrates with electron-builder          |

### 2.2 Backend

| Layer              | Technology                                            | Reason                                                |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Runtime            | **Node.js 20+**                                       | Modern LTS                                            |
| Framework          | **Fastify** (or Hono for edge)                        | Faster than Express, TypeScript-first                 |
| Language           | **TypeScript strict mode**                            | Type safety                                           |
| Database           | **PostgreSQL 16**                                     | Relational data, full-text search                     |
| ORM                | **Prisma**                                            | Type-safe queries, migrations                         |
| Cache / Rate limit | **Redis** (Upstash for serverless)                    | Fast rate limiting, session storage                   |
| Object storage     | **Cloudflare R2**                                     | No egress fees (critical for image hosting)           |
| CDN                | **Cloudflare**                                        | Free tier, global edge                                |
| OCR                | **Tesseract.js** (self-host) OR **Google Vision API** | Start with Tesseract, upgrade if quality insufficient |
| Short URL          | Custom shortener service                              | See section 6.4                                       |
| Auth               | **Lucia** or **Auth.js**                              | Simple, device-token friendly                         |
| Payments           | **Stripe** + **Polar.sh** alternative                 | Stripe for reach, Polar for merchant of record        |
| Analytics          | **PostHog** (self-hosted) or **Plausible**            | Privacy-friendly                                      |
| Error tracking     | **Sentry**                                            | Both desktop and backend                              |
| Logging            | **Pino** + Better Stack                               | Structured logs                                       |

### 2.3 Why Electron and not Tauri/native

- **Tauri**: smaller binary but Rust backend is harder to hire for, smaller ecosystem for desktop-specific needs like clipboard access on Linux
- **Native (Swift/C#/GTK)**: 3x the development time for 3 platforms
- **Electron**: proven for cross-platform dev utilities (Slack, Discord, VS Code, Linear all use it); acceptable bundle size given target audience has modern machines

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    DESKTOP APP (Electron)                    │
│                                                              │
│  ┌────────────────┐     ┌────────────────────────────────┐  │
│  │  Main Process  │     │      Renderer Process          │  │
│  │  (Node.js)     │◄───►│      (React in Chromium)       │  │
│  │                │ IPC │                                │  │
│  │ - FS watcher   │     │ - Settings UI                  │  │
│  │ - Global       │     │ - Upload history               │  │
│  │   hotkeys      │     │ - Login flow                   │  │
│  │ - Clipboard    │     │ - Preview dialogs              │  │
│  │ - Menu bar/    │     │                                │  │
│  │   tray         │     │                                │  │
│  │ - Auto-updater │     │                                │  │
│  └───────┬────────┘     └────────────────────────────────┘  │
│          │                                                   │
└──────────┼───────────────────────────────────────────────────┘
           │ HTTPS
           ▼
┌─────────────────────────────────────────────────────────────┐
│                       BACKEND (Fastify)                      │
│                                                              │
│  ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Upload API  │  │ Auth API │  │ Short URL│  │ OCR Job  │ │
│  └──────┬──────┘  └──────────┘  └──────────┘  └────┬─────┘ │
│         │                                           │       │
│         ▼                                           ▼       │
│  ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Cloudflare  │  │PostgreSQL│  │  Redis   │  │Tesseract │ │
│  │     R2      │  │          │  │  (rate)  │  │  worker  │ │
│  └─────────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    CDN (Cloudflare)                          │
│        Serves https://snp.ink/abc123 (short URL)            │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Critical flow: screenshot → URL in <2s

```
t=0ms   User presses Cmd+Shift+4, selects area
t=200ms OS saves PNG to ~/Desktop (or configured folder)
t=210ms chokidar detects new file → Main process notified
t=220ms Main process reads file, validates (size, format)
t=250ms Main process POSTs to /api/upload (multipart)
t=400ms Backend receives, writes to R2, returns shortId
t=450ms Main process receives {shortId, url}
t=460ms Main process writes URL to system clipboard
t=470ms Main process fires native notification
t=500ms DONE — user sees "URL copied" toast
```

**Budget**: Target 2 seconds but must be <500ms on good network. The perceived magic is "screenshot and URL is already there."

---

## 4. Desktop App Specification

### 4.1 Directory structure

```
snaplink/
├── electron/
│   ├── main.ts                  # Main process entry
│   ├── preload.ts               # Context bridge
│   ├── ipc/
│   │   ├── upload.ts            # Upload handlers
│   │   ├── settings.ts          # Settings IPC
│   │   └── auth.ts              # Auth IPC
│   ├── services/
│   │   ├── watcher.ts           # File watcher service
│   │   ├── clipboard.ts         # Clipboard operations
│   │   ├── uploader.ts          # HTTP upload with retry
│   │   ├── hotkeys.ts           # Global hotkey registration
│   │   ├── tray.ts              # System tray / menu bar
│   │   ├── notifications.ts     # Native notifications
│   │   ├── updater.ts           # Auto-update logic
│   │   └── store.ts             # Persistent settings (electron-store)
│   └── platform/
│       ├── darwin.ts            # macOS-specific (screencapture paths)
│       ├── win32.ts             # Windows-specific (Snipping Tool paths)
│       └── linux.ts             # Linux-specific (various tools)
│
├── src/                         # React renderer
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Settings.tsx
│   │   ├── History.tsx
│   │   ├── Login.tsx
│   │   └── Onboarding.tsx
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── UploadStatus.tsx
│   │   └── ScreenshotCard.tsx
│   ├── hooks/
│   │   └── useIPC.ts
│   ├── stores/
│   │   └── appStore.ts          # Zustand
│   └── lib/
│       └── ipc-bridge.ts        # Typed IPC client
│
├── public/
│   └── icons/                   # App icons for all platforms
│
├── build/                       # electron-builder configs
│   ├── entitlements.mac.plist
│   ├── icon.icns                # macOS
│   ├── icon.ico                 # Windows
│   └── icon.png                 # Linux
│
├── package.json
├── electron-builder.yml
├── vite.config.ts
├── tsconfig.json
└── README.md
```

### 4.2 Main process responsibilities

#### 4.2.1 File watcher

**Default watch paths** (user-configurable):

- **macOS**: `~/Desktop` and `~/Pictures/Screenshots` and the user's configured screenshot location (read from `defaults read com.apple.screencapture location`)
- **Windows**: `%USERPROFILE%\Pictures\Screenshots`, `%USERPROFILE%\OneDrive\Pictures\Screenshots`, `%USERPROFILE%\Desktop` (only watch Desktop optionally — too noisy)
- **Linux**: `~/Pictures` and `~/Pictures/Screenshots`. Detect common screenshot tools: `gnome-screenshot`, `spectacle` (KDE), `flameshot`, `scrot`

**File filter**:

- Only watch image files: `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`
- File must match a "screenshot" heuristic:
  - **macOS**: filename matches `/^Screen Shot \d{4}-\d{2}-\d{2}/` or `/^Screenshot \d{4}-\d{2}-\d{2}/` or `/^CleanShot/` or similar
  - **Windows**: filename matches `/^Screenshot/` or `/^Snip/`
  - **Linux**: varies by tool, match common patterns
- Fallback: if user enables "watch all images", skip the filename check
- File must have been created (not modified) within the last 10 seconds
- File size between 10KB and 20MB (skip weird files)
- Must be a valid image (verify magic bytes, not just extension)

**Debouncing**: Some OSes fire multiple events per file. Debounce 300ms per file path.

**Implementation**:

```typescript
import chokidar from "chokidar";
import { app } from "electron";
import path from "path";
import os from "os";

export class ScreenshotWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private recentlyProcessed = new Set<string>();
  
  start(watchPaths: string[], onDetected: (filepath: string) => void) {
    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,     // critical: don't fire for existing files
      persistent: true,
      depth: 0,                // don't recurse into subfolders
      awaitWriteFinish: {      // wait until file stops being written
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });
    
    this.watcher.on("add", async (filepath) => {
      if (this.recentlyProcessed.has(filepath)) return;
      this.recentlyProcessed.add(filepath);
      setTimeout(() => this.recentlyProcessed.delete(filepath), 5000);
      
      if (await this.isScreenshot(filepath)) {
        onDetected(filepath);
      }
    });
  }
  
  private async isScreenshot(filepath: string): Promise<boolean> {
    // filename heuristic + size check + magic bytes check
    // (implementation details per platform)
  }
  
  stop() {
    this.watcher?.close();
  }
}
```

#### 4.2.2 Uploader

**Retry policy**: 3 retries with exponential backoff (1s, 2s, 4s). Fail silently after 3 attempts, show a failure toast with "retry" button.

**Request format**: `multipart/form-data` POST to `/api/v1/upload`

```
Content-Type: multipart/form-data
Authorization: Bearer {device_token}
X-Client-Version: 1.0.0
X-Platform: darwin | win32 | linux

Fields:
  file: binary image data
  burn_after_read: "true" | "false" (default false)
  ocr: "true" | "false" (default true for Pro users, false for free)
  expires_in: "never" | "1h" | "1d" | "7d" | "30d" (Pro only)
  project_id: string (optional, for teams)
```

**Response**:

```json
{
  "id": "abc123",
  "url": "https://snp.ink/abc123",
  "rawUrl": "https://snp.ink/raw/abc123",
  "expiresAt": null,
  "ocrJobId": "ocr_xyz" // if OCR queued
}
```

**Timeout**: 30 seconds per attempt. Show progress in notification if upload takes >3 seconds.

#### 4.2.3 Global hotkey

Register a global shortcut (user-configurable, default):

- **macOS**: `Cmd+Shift+8`
- **Windows**: `Ctrl+Shift+8`
- **Linux**: `Ctrl+Shift+8`

**Behavior**: Pressing the hotkey triggers the OS native screenshot tool with area selection:

- **macOS**: programmatically trigger `Cmd+Shift+4` via AppleScript or just document that users still use the OS shortcut
- **Windows**: invoke `SnippingTool.exe /clip`
- **Linux**: invoke `gnome-screenshot -a` or detect available tool

**Better approach**: Instead of triggering the OS tool, just document that the user uses their existing OS shortcut. The **auto-watch** is what makes us magic. Use the global hotkey for **app-specific actions** instead:

- Default `Cmd/Ctrl+Shift+V` = "Upload clipboard image right now" (user already has an image in clipboard)
- Default `Cmd/Ctrl+Shift+H` = "Toggle history window"

#### 4.2.4 Clipboard operations

After successful upload:

```typescript
import { clipboard } from "electron";

// Write URL as plain text
clipboard.writeText(url);

// Also write as rich HTML so Markdown editors can paste as image
const markdown = `![screenshot](${url})`;
clipboard.write({
  text: url,
  html: `<a href="${url}">${url}</a>`,
});
```

**User setting**: Toggle "Copy as Markdown" vs "Copy as plain URL" vs "Copy as HTML img tag".

#### 4.2.5 System tray / menu bar

**macOS**: NSStatusBar icon with these menu items:

- `● Connected` / `○ Offline` (status indicator)
- `Upload clipboard image` — hotkey hint
- `Recent uploads` → submenu of last 10 URLs (click to copy)
- `—`
- `Open dashboard`
- `Settings…`
- `Help & feedback`
- `—`
- `Pause auto-upload` (toggle)
- `—`
- `Quit SnapLink`

**Windows**: System tray icon with same menu. Balloon notification for events.

**Linux**: AppIndicator (Ubuntu/GNOME) or StatusNotifierItem (KDE). Fall back to native `Tray` if neither works.

**Icon states**:

- Idle: default icon
- Uploading: animated (3 dots)
- Error: red dot overlay
- Offline: grayed out

#### 4.2.6 Native notifications

Fire for these events:

- Upload success: "📎 URL copied: snp.ink/abc123" with "Open" action
- Upload failure: "⚠️ Upload failed. Click to retry." with "Retry" action
- OCR completed (if enabled): "🔤 OCR ready for snp.ink/abc123"
- New version available: "🚀 SnapLink 1.1 available. Click to update."

**Important**: On macOS, notifications require explicit user permission on first run. Request early in onboarding.

#### 4.2.7 Auto-updater

Use `electron-updater` with GitHub Releases as the update source for open-source parts, or your own S3/R2 bucket.

**Update channel**: Start with single "stable" channel. Add "beta" later.

**Update UX**:

- Check for updates on app start (if last check > 24h ago)
- Check every 6h while app is running
- Download in background
- Prompt user: "SnapLink 1.1 is ready. Relaunch to install? [Now / Tonight]"
- If "Tonight": install on next launch after 2 AM local time

### 4.3 Renderer (React) responsibilities

The renderer is shown in a BrowserWindow that is **hidden by default** and opened via tray menu. It's NOT the primary interaction — the tray is.

**Windows**:

1. **Main window** (800×600, hidden by default)
   - Tabs: History, Settings, Projects, Account
2. **Onboarding window** (600×500, shown on first launch)
   - Welcome → Permission grants → Account link → Test upload → Done
3. **Preview popover** (optional, 400×300, shown near tray icon after upload)
   - Thumbnail + URL + Copy/Open/Delete buttons
   - Auto-dismiss after 5s or click outside

### 4.4 Settings schema

Stored via `electron-store` in platform-specific location:

- **macOS**: `~/Library/Application Support/SnapLink/config.json`
- **Windows**: `%APPDATA%\SnapLink\config.json`
- **Linux**: `~/.config/SnapLink/config.json`

```typescript
interface Settings {
  // Core
  enabled: boolean;                    // master on/off
  autoStart: boolean;                  // launch at login
  watchPaths: string[];                // folders to watch
  
  // Upload
  copyFormat: "url" | "markdown" | "html";
  autoUpload: boolean;                 // false = ask before upload
  uploadNotification: boolean;
  
  // Privacy
  defaultBurnAfterRead: boolean;
  defaultExpiresIn: "never" | "1h" | "1d" | "7d" | "30d";
  stripExifMetadata: boolean;
  
  // Features
  ocrEnabled: boolean;
  ocrLanguages: string[];              // ["eng", "chi_sim", ...]
  
  // Hotkeys (user-configurable)
  hotkeys: {
    uploadClipboard: string;           // default "CmdOrCtrl+Shift+V"
    toggleHistory: string;
    togglePause: string;
  };
  
  // Account
  deviceToken: string | null;          // JWT for this device
  userEmail: string | null;
  plan: "free" | "pro" | "team";
  
  // Advanced
  uploadEndpoint: string;              // for self-hosting / enterprise
  analyticsOptIn: boolean;
  telemetryOptIn: boolean;
}
```

### 4.5 IPC contract (main ↔ renderer)

**Type-safe IPC** via preload script:

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke("settings:update", patch),
  
  // Uploads
  getUploadHistory: (limit: number) => ipcRenderer.invoke("uploads:history", limit),
  deleteUpload: (id: string) => ipcRenderer.invoke("uploads:delete", id),
  uploadFile: (filepath: string) => ipcRenderer.invoke("uploads:file", filepath),
  uploadClipboard: () => ipcRenderer.invoke("uploads:clipboard"),
  
  // Events (main → renderer)
  onUploadStart: (cb: (data: { filepath: string }) => void) =>
    ipcRenderer.on("upload:start", (_, data) => cb(data)),
  onUploadComplete: (cb: (data: { id: string; url: string }) => void) =>
    ipcRenderer.on("upload:complete", (_, data) => cb(data)),
  onUploadError: (cb: (err: { code: string; message: string }) => void) =>
    ipcRenderer.on("upload:error", (_, err) => cb(err)),
  
  // Auth
  loginWithBrowser: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  
  // System
  openUrl: (url: string) => ipcRenderer.invoke("system:openUrl", url),
  showItemInFolder: (filepath: string) => ipcRenderer.invoke("system:reveal", filepath),
  platform: process.platform,
  version: "1.0.0",
};

contextBridge.exposeInMainWorld("snaplink", api);
```

---

## 5. Backend Specification

### 5.1 Database schema

```prisma
// Prisma schema

model User {
  id              String    @id @default(cuid())
  email           String    @unique
  emailVerified   DateTime?
  createdAt       DateTime  @default(now())
  plan            Plan      @default(FREE)
  stripeCustomerId String?
  
  devices         Device[]
  uploads         Upload[]
  projects        ProjectMember[]
  
  @@index([email])
}

model Device {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  name            String              // "Johns MacBook Pro"
  platform        String              // darwin / win32 / linux
  appVersion      String
  tokenHash       String   @unique    // hashed device token (JWT jti)
  lastSeenAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  revokedAt       DateTime?
  
  @@index([userId])
  @@index([tokenHash])
}

model Upload {
  id              String    @id @default(cuid())
  shortId         String    @unique   // 6-char, public
  userId          String?              // null = anonymous
  user            User?     @relation(fields: [userId], references: [id])
  deviceId        String?
  projectId       String?
  project         Project?  @relation(fields: [projectId], references: [id])
  
  storageKey      String               // R2 object key
  originalName    String?
  mimeType        String
  sizeBytes       Int
  width           Int?
  height          Int?
  
  ocrText         String?   @db.Text
  ocrLang         String?
  ocrStatus       OcrStatus @default(PENDING)
  
  burnAfterRead   Boolean   @default(false)
  expiresAt       DateTime?
  viewCount       Int       @default(0)
  firstViewedAt   DateTime?
  isBlocked       Boolean   @default(false)
  
  createdAt       DateTime  @default(now())
  ipHash          String
  
  @@index([shortId])
  @@index([userId])
  @@index([expiresAt])
  @@index([createdAt])
}

model Project {
  id              String          @id @default(cuid())
  name            String
  slug            String          @unique
  ownerId         String
  createdAt       DateTime        @default(now())
  members         ProjectMember[]
  uploads         Upload[]
}

model ProjectMember {
  id        String   @id @default(cuid())
  userId    String
  projectId String
  role      Role     @default(MEMBER)
  user      User     @relation(fields: [userId], references: [id])
  project   Project  @relation(fields: [projectId], references: [id])
  
  @@unique([userId, projectId])
}

enum Plan {
  FREE
  PRO
  TEAM
  ENTERPRISE
}

enum Role {
  OWNER
  ADMIN
  MEMBER
}

enum OcrStatus {
  SKIPPED
  PENDING
  COMPLETED
  FAILED
}
```

### 5.2 REST API

All endpoints versioned under `/api/v1`.

#### POST `/api/v1/auth/device`

Creates a device token after email verification or OAuth.

**Body**:

```json
{
  "email": "user@example.com",
  "deviceName": "John's MacBook Pro",
  "platform": "darwin",
  "appVersion": "1.0.0"
}
```

Server sends a magic link email. User clicks → browser opens → redirects to `snaplink://auth?token=xxx` (custom protocol). Desktop app catches the redirect, exchanges `token` for a permanent device JWT.

**Response**:

```json
{
  "deviceToken": "eyJ...",
  "user": {
    "id": "usr_abc",
    "email": "user@example.com",
    "plan": "free"
  }
}
```

#### POST `/api/v1/upload`

**Headers**:

```
Authorization: Bearer {deviceToken}   (optional — anonymous allowed for free tier)
Content-Type: multipart/form-data
X-Client-Version: 1.0.0
X-Platform: darwin|win32|linux
```

**Body (multipart)**:

```
file: (binary)
burn_after_read: true|false
ocr: true|false
expires_in: never|1h|1d|7d|30d
project_id: (optional)
```

**Response 201**:

```json
{
  "id": "abc123",
  "url": "https://snp.ink/abc123",
  "rawUrl": "https://snp.ink/raw/abc123",
  "markdown": "![](https://snp.ink/abc123)",
  "html": "<img src=\"https://snp.ink/abc123\" />",
  "expiresAt": null,
  "burnAfterRead": false,
  "ocrStatus": "pending",
  "size": 342821,
  "width": 1920,
  "height": 1080
}
```

**Errors**:

- `400` — invalid file (not an image, corrupt, too large)
- `401` — invalid token
- `402` — Pro feature required (e.g. custom expiration on free tier)
- `413` — payload too large
- `429` — rate limit exceeded
- `451` — content blocked by moderation (return immediately, don't store)

**Rate limits**:

- Anonymous: 10 uploads/hour, 50/day per IP
- Free account: 50 uploads/day, 500/month
- Pro: 1000 uploads/day, 20000/month
- Team: 5000 uploads/day per member

**Content validation**:

- MIME type must be `image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/gif`
- Verify magic bytes match claimed MIME type
- File size: 10KB min, 20MB max (free), 50MB max (Pro)
- Scan with NSFW classifier (see section 9)
- Strip EXIF metadata by default (privacy)

#### GET `/api/v1/upload/:shortId`

Returns upload metadata (not the image itself).

**Response**:

```json
{
  "id": "abc123",
  "url": "https://snp.ink/abc123",
  "createdAt": "2026-04-13T10:00:00Z",
  "expiresAt": null,
  "viewCount": 3,
  "ocrText": "Error: undefined is not a function",
  "width": 1920,
  "height": 1080
}
```

#### GET `/abc123`

Public image serving endpoint on the short-URL domain (e.g., `snp.ink`).

**Response**:

- If valid: redirect (302) to signed R2 URL, OR proxy the image directly with `Content-Type: image/png`
- Increment `viewCount` atomically
- If `burnAfterRead` and `firstViewedAt` is null: set `firstViewedAt`, return image, schedule deletion in 60s
- If `burnAfterRead` and `firstViewedAt` is not null: return 410 Gone
- If expired: return 410 Gone
- If blocked: return 451

**AI bot detection**: Check User-Agent. If matches known AI crawlers (`ChatGPT-User`, `Claude-Web`, `GPTBot`, `anthropic-ai`, etc.), track separately for analytics.

#### GET `/raw/abc123`

Returns the image with `Content-Disposition: inline` and appropriate caching headers. Optimized for AI bot consumption (smaller latency, direct image response).

#### DELETE `/api/v1/upload/:shortId`

Authenticated. Only the owner can delete.

#### GET `/api/v1/uploads`

List user's uploads with pagination.

**Query**: `?limit=20&cursor=xxx&project_id=yyy`

#### POST `/api/v1/ocr/:shortId`

Trigger OCR manually (if not done during upload).

### 5.3 Short URL service

**Domain**: Register a short domain. Candidates (check availability):

- `snp.ink` (preferred: 3 chars + .ink)
- `snk.sh`
- `snl.cc`
- `shot.to`

**Short ID format**:

- 6 characters, base62 (`[0-9A-Za-z]`)
- Gives 62^6 ≈ 56 billion combinations
- Use `nanoid` with custom alphabet, retry on collision
- Reserved words: `api`, `www`, `admin`, `app`, `raw`, `go`, `p`, `i`, `help`, `docs`, `terms`, `privacy`, `login`, `signup`, `pricing`

**URL structure**:

- `https://snp.ink/abc123` — main (HTML preview or image)
- `https://snp.ink/raw/abc123` — raw image, cacheable
- `https://snp.ink/i/abc123.png` — direct image with extension (helps some clients)

### 5.4 OCR pipeline

**Default**: Tesseract.js running in a worker process on the backend.

**Flow**:

1. On upload, if `ocr: true`, create a `Job` in queue (BullMQ + Redis)
2. Worker pulls job, runs Tesseract
3. Saves `ocrText` to upload record
4. Updates `ocrStatus: "completed"`

**Languages**: Default `eng`. Pro users can request multi-language (`chi_sim`, `jpn`, `kor`, `ara`, `rus`, `spa`, `fra`, `deu`, `por`).

**Performance target**: OCR completes in <5 seconds for typical screenshots. If >10s, mark as `FAILED` and don't block upload.

**Alternative**: Upgrade to Google Vision API ($1.50/1000 images) if Tesseract quality is insufficient. Gate behind Pro tier.

**Exposing OCR to users**:

1. Main URL page `https://snp.ink/abc123` shows image + a collapsible "Extracted Text" section
2. Raw API `GET /api/v1/upload/:id` includes `ocrText` field
3. Special URL format: `https://snp.ink/abc123.txt` returns only the OCR text — useful for AI agents that want text-only

### 5.5 Image storage

**Cloudflare R2**:

- Bucket: `snaplink-uploads`
- Key format: `{year}/{month}/{shortId}.{ext}`
- ACL: private; serve via signed URLs OR via Cloudflare Worker
- Lifecycle rule: delete objects 24h after their upload's `expiresAt`

**CDN**:

- Cloudflare CDN in front of everything
- Cache-Control: `public, max-age=31536000, immutable` for `/raw/:id`
- Cache-Control: `no-cache` for burn-after-read URLs (critical — must not cache)

**Deduplication**:

- Compute SHA-256 of uploaded file
- If hash exists in R2: reuse existing object (saves storage)
- But still create new `Upload` record (different shortId, different ownership)

---

## 6. User Authentication Flow

Desktop apps have a tricky auth flow. We use **browser-based auth with deep linking**.

### 6.1 First-time auth

1. User clicks "Sign in" in desktop app
2. App generates a random `session_id`
3. App opens browser to `https://snaplink.io/auth/desktop?session=abc123`
4. User enters email on website → receives magic link
5. User clicks magic link → website redirects to `snaplink://auth/callback?session=abc123&code=xyz`
6. Desktop app (registered as handler for `snaplink://` protocol) catches the URL
7. App exchanges `code` for a device JWT via `POST /api/v1/auth/device/exchange`
8. App stores JWT in OS keychain (use `keytar` library)

### 6.2 Protocol handler registration

**macOS**: in `Info.plist`

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>snaplink</string>
    </array>
  </dict>
</array>
```

**Windows**: registry entries written at install time by electron-builder

**Linux**: `.desktop` file with `MimeType=x-scheme-handler/snaplink;`

### 6.3 Token storage

Use `keytar` to store JWT in OS keychain:

- **macOS**: Keychain
- **Windows**: Credential Manager
- **Linux**: Secret Service API (libsecret) or gnome-keyring

Never store tokens in plain JSON files.

---

## 7. Distribution & Packaging

### 7.1 Build configuration (`electron-builder.yml`)

```yaml
appId: io.snaplink.app
productName: SnapLink
copyright: Copyright © 2026 SnapLink Inc.

directories:
  output: dist
  buildResources: build

files:
  - "dist-electron/**/*"
  - "dist-renderer/**/*"
  - "!node_modules/**/*"

asar: true
asarUnpack:
  - "node_modules/keytar/**/*"

# macOS
mac:
  category: public.app-category.developer-tools
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: "YOUR_TEAM_ID"
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]

dmg:
  sign: true
  contents:
    - x: 410
      y: 150
      type: link
      path: /Applications
    - x: 130
      y: 150
      type: file

# Windows
win:
  icon: build/icon.ico
  target:
    - target: nsis
      arch: [x64, arm64]
    - target: portable
      arch: [x64]
  publisherName: "SnapLink Inc."
  verifyUpdateCodeSignature: true

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: SnapLink

# Linux
linux:
  icon: build/icon.png
  category: Utility
  synopsis: "Screenshot to URL for AI workflows"
  target:
    - AppImage
    - deb
    - rpm
    - snap
  desktop:
    Name: SnapLink
    Comment: "Screenshot to URL for AI workflows"
    Categories: Utility;Network;
    MimeType: x-scheme-handler/snaplink;

publish:
  - provider: github
    owner: yourorg
    repo: snaplink
    releaseType: release
```

### 7.2 Code signing

#### macOS

**Required** — unsigned apps trigger Gatekeeper warnings that kill conversion.

- Enroll in Apple Developer Program ($99/year)

- Get a "Developer ID Application" certificate

- Set env vars for notarization:

  ```bash
  export APPLE_ID="you@example.com"
  export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
  export APPLE_TEAM_ID="ABCDE12345"
  ```

- Every build must be signed AND notarized

- `electron-builder` handles this if env vars are set

**Entitlements** (`build/entitlements.mac.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-only</key>
  <true/>
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
  <key>com.apple.security.files.pictures.read-write</key>
  <true/>
</dict>
</plist>
```

#### Windows

**Required** for not triggering SmartScreen warnings.

- Purchase a Code Signing Certificate ($100-400/year):

  - **EV Certificate** ($400/year): instant trust, no SmartScreen warning
  - **OV Certificate** ($100/year): trust builds after ~3000 installs
  - Recommended providers: SSL.com, DigiCert, Sectigo

- In CI/CD:

  ```bash
  export CSC_LINK="file://path/to/cert.pfx"
  export CSC_KEY_PASSWORD="your_password"
  ```

#### Linux

No mandatory signing. Sign AppImage with GPG if desired.

### 7.3 Auto-update

Use `electron-updater` + GitHub Releases.

**Release flow**:

1. Bump version in `package.json`
2. `npm run build:mac && npm run build:win && npm run build:linux`
3. Artifacts: `.dmg`, `.exe`, `.AppImage`, `.deb`, `.rpm`, plus `latest-mac.yml`, `latest.yml`, `latest-linux.yml`
4. Upload all to a GitHub Release
5. Users running older versions auto-detect update within 6h

**GitHub Actions workflow**: see section 11.

### 7.4 Distribution channels

| Channel                           | Platform | Priority | Notes                                                  |
| --------------------------------- | -------- | -------- | ------------------------------------------------------ |
| **Own website (direct download)** | All      | P0       | Full control, no cut                                   |
| **Mac App Store**                 | macOS    | P1       | Optional, Apple takes 30%/15%. Submit a "Lite" version |
| **Homebrew Cask**                 | macOS    | P0       | `brew install --cask snaplink` — developers love this  |
| **Microsoft Store**               | Windows  | P1       | Microsoft takes 15%, opt-in                            |
| **Winget**                        | Windows  | P0       | `winget install snaplink`                              |
| **Chocolatey**                    | Windows  | P1       | Developer-focused package manager                      |
| **Scoop**                         | Windows  | P2       | Smaller but dev-centric                                |
| **Snap Store**                    | Linux    | P0       | `snap install snaplink`                                |
| **Flathub**                       | Linux    | P0       | `flatpak install snaplink`                             |
| **AUR** (Arch)                    | Linux    | P1       | Community-maintained usually                           |
| **GitHub Releases**               | All      | P0       | Required for auto-updater anyway                       |

### 7.5 Platform-specific distribution requirements

#### Homebrew Cask

Create a PR to homebrew-cask repo:

```ruby
cask "snaplink" do
  version "1.0.0"
  sha256 "..."
  
  url "https://github.com/yourorg/snaplink/releases/download/v#{version}/SnapLink-#{version}.dmg"
  name "SnapLink"
  desc "Screenshot to URL for AI workflows"
  homepage "https://snaplink.io"
  
  app "SnapLink.app"
  
  zap trash: [
    "~/Library/Application Support/SnapLink",
    "~/Library/Preferences/io.snaplink.app.plist",
  ]
end
```

#### Winget

Submit manifest to `microsoft/winget-pkgs`:

```yaml
PackageIdentifier: SnapLink.SnapLink
PackageVersion: 1.0.0
PackageName: SnapLink
Publisher: SnapLink Inc.
License: Proprietary
ShortDescription: Screenshot to URL for AI workflows
Installers:
  - Architecture: x64
    InstallerType: nsis
    InstallerUrl: https://github.com/yourorg/snaplink/releases/download/v1.0.0/SnapLink-Setup-1.0.0.exe
    InstallerSha256: ...
ManifestType: singleton
ManifestVersion: 1.4.0
```

#### Snap Store

`snapcraft.yaml`:

```yaml
name: snaplink
base: core22
version: '1.0.0'
summary: Screenshot to URL for AI workflows
description: |
  SnapLink watches your screenshot folder and instantly converts
  new screenshots to shareable URLs, optimized for AI coding tools
  like Claude Code, Cursor, and ChatGPT.

grade: stable
confinement: strict

apps:
  snaplink:
    command: snaplink
    plugs: [home, network, desktop, desktop-legacy, x11, unity7]
```

---

## 8. Security & Privacy

### 8.1 Privacy principles

- **Local-first defaults**: user's screenshot never leaves the device until they explicitly opt in (via the auto-upload toggle in onboarding)
- **No keylogging**: we do NOT read clipboard continuously; we only read when the user explicitly triggers an upload or when a screenshot file appears
- **EXIF stripping**: by default, EXIF metadata (including GPS, device info) is stripped before upload
- **Content not indexed by search engines**: all uploaded images have `X-Robots-Tag: noindex, nofollow`
- **IP hashing**: we log hashed IPs (HMAC-SHA256 with rotating salt), never raw IPs

### 8.2 Security measures

- **TLS everywhere**: HTTPS-only, HSTS header, no HTTP redirect
- **CSP headers** on web pages
- **CSRF tokens** on authenticated endpoints
- **Rate limiting** at multiple layers (Cloudflare, app, DB)
- **Signed upload URLs** for R2 (pre-signed POST, 5 minute expiration)
- **Device token rotation**: JWTs expire in 90 days, auto-refresh

### 8.3 Content moderation

Required before public launch.

**Pipeline**:

1. Every upload runs through NSFW classifier (use `@tensorflow-models/nsfwjs` on backend or AWS Rekognition)
2. If score > 0.85, reject with 451
3. If score 0.5-0.85, flag for human review, allow upload but mark `needsReview: true`
4. Public report endpoint: `POST /api/v1/report/:shortId` with reason
5. 3+ reports on same image → auto-block pending review
6. Keep a blocklist of perceptual hashes for known-bad images

### 8.4 Compliance

- **GDPR**: user can export all their data (uploads, account info) via Settings → Export
- **GDPR**: user can delete account and all data via Settings → Delete Account
- **Data retention**: deleted uploads are hard-deleted from R2 within 30 days (soft-deleted in DB immediately)
- **Privacy policy + ToS**: required pages at launch

---

## 9. Monetization

### 9.1 Pricing tiers

| Feature           | Free          | Pro $4.99/mo    | Team $12/mo per seat |
| ----------------- | ------------- | --------------- | -------------------- |
| Screenshots/day   | 50            | 1000            | 5000                 |
| Storage           | 1 GB          | 50 GB           | 500 GB               |
| Retention         | 7 days        | Forever         | Forever              |
| OCR               | English only  | 30+ languages   | 30+ languages        |
| Custom expiration | No            | Yes             | Yes                  |
| Burn after read   | Yes (limited) | Yes (unlimited) | Yes (unlimited)      |
| Custom domain     | No            | Yes             | Yes                  |
| Team shared space | No            | No              | Yes                  |
| API access        | No            | 1000 calls/day  | 10000 calls/day      |
| Audit log         | No            | 30 days         | 1 year               |
| Priority support  | No            | Yes             | Yes                  |

### 9.2 Conversion triggers

Track these events and show upgrade prompts:

| Trigger                      | Prompt                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| User hits 50 uploads/day     | "You've reached the free daily limit. Upgrade to Pro for 1000/day." |
| User tries custom expiration | "Custom expiration is a Pro feature. $4.99/month."           |
| User's upload > 20MB         | "Large files require Pro. Current: 22MB, Free max: 20MB."    |
| User tries custom domain     | "Custom domains are a Pro feature."                          |
| 30 days after signup         | Email: "You've uploaded 127 screenshots! See what Pro unlocks." |

### 9.3 Payment integration

- **Stripe Checkout** for primary checkout
- **Polar.sh** or **Paddle** as Merchant of Record alternative (handles VAT/taxes globally)
- Desktop app opens browser to Stripe checkout; webhook updates user plan
- Customer portal for subscription management

---

## 10. AI Integration Hooks

This is your differentiator. Don't skip these.

### 10.1 MCP Server (critical for the AI workflow)

Create an MCP (Model Context Protocol) server that Claude, Cursor, and other MCP-compatible tools can use:

**Install**:

```bash
npx @snaplink/mcp-server
```

**MCP tools exposed**:

- `upload_screenshot(filepath)` → returns URL
- `upload_clipboard_image()` → returns URL
- `search_uploads(query)` → returns matching URLs with OCR text
- `get_recent(n)` → returns last N uploads

**Claude Desktop config**:

```json
{
  "mcpServers": {
    "snaplink": {
      "command": "npx",
      "args": ["-y", "@snaplink/mcp-server"],
      "env": {
        "SNAPLINK_TOKEN": "sk_xxx"
      }
    }
  }
}
```

User workflow: in Claude, "Upload my latest screenshot" → Claude calls MCP tool → gets URL → includes in response.

### 10.2 OCR text API for AI consumption

Expose `https://snp.ink/abc123.txt` that returns:

```
[OCR Extracted Text]
Error: Cannot read property 'map' of undefined
  at processArray (app.js:42)
  at Main.render (Main.tsx:18)

[Metadata]
Screenshot uploaded: 2026-04-13 10:23 UTC
Dimensions: 1920x1080
```

This is 100x smaller than the image in tokens — AI agents can grab this first, only fetch the image if needed.

### 10.3 AI-friendly HTML preview

The `https://snp.ink/abc123` page, if accessed by an AI bot (detected by User-Agent), returns a simplified HTML:

```html
<!DOCTYPE html>
<html>
<head><title>Screenshot</title></head>
<body>
<p>Screenshot shared via SnapLink.</p>
<img src="/raw/abc123" alt="{ocrText}" />
<h2>Extracted Text</h2>
<pre>{ocrText}</pre>
</body>
</html>
```

Key: the `<img alt>` contains OCR text, which many AIs read even without loading the image.

### 10.4 Browser extension (optional, v2)

A Chrome/Firefox extension that integrates with Claude.ai and ChatGPT:

- Right-click image on web → "Re-host on SnapLink"
- Paste URL in Claude.ai → auto-expand to show OCR text inline

---

## 11. CI/CD Pipeline

### 11.1 GitHub Actions workflow

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install
        run: npm ci
      
      - name: Build renderer
        run: npm run build:renderer
      
      - name: Build & publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.WINDOWS_CERT }}
          CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
        run: npm run release
```

### 11.2 Testing in CI

Before building releases, run:

```yaml
test:
  runs-on: ${{ matrix.os }}
  strategy:
    matrix:
      os: [macos-latest, ubuntu-latest, windows-latest]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run lint
    - run: npm run typecheck
    - run: npm run test:unit
    - run: npm run test:e2e   # uses Playwright on Electron
```

### 11.3 Smoke test after release

After each release, run a smoke test that:

1. Downloads the latest release binary for each platform
2. Installs it silently in a CI runner
3. Launches it
4. Verifies the app starts, connects to backend, and can upload a test image
5. Reports pass/fail to Slack

---

## 12. Testing

### 12.1 Unit tests

Use **Vitest** (Jest-compatible, faster).

Test coverage targets:

- `electron/services/*` — 80%
- `src/stores/*` — 90%
- Backend API handlers — 85%

### 12.2 Integration tests

- **File watcher**: drop files into temp folder, verify detection
- **Upload flow**: mock backend, test retry logic
- **IPC**: test each channel with mock main/renderer

### 12.3 E2E tests

Use **Playwright** with Electron:

```typescript
import { _electron as electron } from "playwright";

test("full upload flow", async () => {
  const app = await electron.launch({ args: ["electron/main.js"] });
  const window = await app.firstWindow();
  
  // Drop a screenshot into watched folder
  await copyFixture("screenshot.png", "~/Desktop/Screenshot 2026.png");
  
  // Wait for notification
  await window.waitForEvent("notification");
  
  // Verify clipboard content
  const clipboard = await app.evaluate(async ({ clipboard }) => {
    return clipboard.readText();
  });
  expect(clipboard).toMatch(/^https:\/\/snp\.ink\//);
  
  await app.close();
});
```

### 12.4 Manual test checklist

Maintain a manual test checklist in `docs/MANUAL_TESTING.md`. Before each release, run through:

**Per-platform checks**:

- [ ] Fresh install works
- [ ] Auto-start on boot works
- [ ] Global hotkey works after reboot
- [ ] Tray/menu bar icon appears correctly
- [ ] Notifications fire
- [ ] Screenshot detection works for native OS tool
- [ ] Screenshot detection works for 3rd-party tools (CleanShot X, ShareX, Flameshot)
- [ ] Clipboard is populated with URL
- [ ] OCR completes within 10s
- [ ] Burn-after-read works (URL returns 410 on 2nd visit)
- [ ] Auto-update download + install works
- [ ] Uninstall leaves no residue

---

## 13. Observability

### 13.1 Metrics to track

**Product metrics**:

- DAU / MAU
- Screenshots uploaded per user per day
- Upload success rate (target: >99%)
- Upload p50 / p95 / p99 latency
- OCR success rate
- Free → Pro conversion rate

**Desktop app metrics** (via Sentry + custom):

- App version distribution
- Platform distribution
- Crash rate by platform
- Time between screenshot detection and URL in clipboard

**Backend metrics** (via Prometheus + Grafana or equivalent):

- API endpoint latencies
- R2 storage usage
- Database query times
- Worker queue depth (OCR)

### 13.2 Alerts

- Upload success rate < 98% (5 min window)
- API p99 > 3 seconds
- OCR queue depth > 1000
- Any 5xx rate > 1%
- R2 error rate > 0.5%

---

## 14. Launch Sequence

### 14.1 Pre-launch (Weeks 1-8)

- [ ] Build MVP (weeks 1-6)
- [ ] Internal dogfooding (week 7)
- [ ] Private beta with 20 users (week 8, Claude/Cursor power users)

### 14.2 Launch week

Coordinated across:

- [ ] Day 0: Submit to Homebrew Cask, Winget, Snap
- [ ] Day 1 Tuesday 00:01 PT: Product Hunt launch
- [ ] Day 1 Tuesday 09:00 ET: Hacker News "Show HN"
- [ ] Day 1: Reddit posts in r/ClaudeAI, r/ChatGPTCoding, r/cursor (stagger by hour)
- [ ] Day 2: Twitter thread with 60s demo GIF
- [ ] Day 3: Dev.to article "How I built a screenshot tool for AI workflows"
- [ ] Day 4: Publish to MCP registry
- [ ] Day 5-7: Respond to all comments, iterate on common feedback

### 14.3 Post-launch (Weeks 9+)

- Weekly releases based on user feedback
- Monthly major features
- Quarterly: reassess pricing, feature gating

---

## 15. Implementation Order (Strict Sequence)

### Phase 1 — Core loop (Week 1-2)

1. Set up monorepo: `apps/desktop`, `apps/backend`, `packages/shared-types`
2. Initialize Electron app with Vite + React
3. Initialize backend with Fastify + Prisma
4. Implement database migrations
5. Build minimal `POST /api/v1/upload` endpoint (no auth, no OCR)
6. Build minimal desktop file watcher + uploader
7. Verify end-to-end: drop PNG in folder → URL in clipboard

**Milestone**: It works on your own Mac.

### Phase 2 — Platform & polish (Week 3-4)

8. Cross-platform testing (run on Windows + Linux)
9. Platform-specific screenshot path detection
10. System tray / menu bar with full menu
11. Native notifications
12. Settings window + persistent settings
13. Onboarding flow

**Milestone**: Works on all three platforms, looks polished.

### Phase 3 — Auth & plans (Week 5)

14. Backend auth (magic link + device JWT)
15. Deep link protocol handler
16. Token storage in OS keychain
17. Stripe integration for Pro tier
18. Free / Pro feature gating

**Milestone**: Users can sign up and pay.

### Phase 4 — AI-specific features (Week 6)

19. OCR pipeline (Tesseract worker)
20. Burn-after-read
21. Short URL domain setup
22. MCP server package
23. `.txt` endpoint for OCR-only access

**Milestone**: Differentiated from generic image hosts.

### Phase 5 — Distribution (Week 7)

24. Apple Developer enrollment + code signing
25. Windows EV certificate + code signing
26. electron-builder config for all platforms
27. GitHub Actions release workflow
28. Auto-updater testing
29. Submit to Homebrew, Winget, Snap

**Milestone**: Users can install via package managers.

### Phase 6 — Launch prep (Week 8)

30. Landing page
31. Documentation site
32. Privacy policy + ToS
33. Stripe Customer Portal
34. Support email + helpdesk
35. Beta feedback integration
36. Launch assets (screenshots, video, Product Hunt, HN post)

**Milestone**: Ready to launch.

---

## 16. Open Questions for the Operator

If any of these are unclear, **ask before assuming**:

1. **Product name confirmed?** (SnapLink is placeholder)
2. **Short domain acquired?** (snp.ink or alternative)
3. **Backend hosting target?** (Fly.io / Railway / AWS / Vercel?)
4. **Apple Developer Program enrolled?** (required 2-4 weeks before Mac release)
5. **Windows EV certificate purchased?** (can add later, will have SmartScreen warning until reputation builds)
6. **Stripe + Polar accounts set up?**
7. **Postgres + Redis hosts decided?** (Supabase / Neon / Railway / self-hosted?)
8. **R2 account + bucket created?**
9. **Analytics provider chosen?** (PostHog / Plausible?)
10. **Sentry org created?**
11. **Team size and timeline?** (solo dev 8 weeks is tight; 2 devs 6 weeks is more realistic)
12. **Branding / logo designed?** (needed for app icons on all 3 platforms)

---

## 17. Appendix: Critical Code Snippets

### 17.1 File watcher with platform detection

```typescript
// electron/services/watcher.ts
import chokidar from "chokidar";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export function getDefaultWatchPaths(): string[] {
  const home = os.homedir();
  
  switch (process.platform) {
    case "darwin": {
      // Read macOS screenshot location from defaults
      try {
        const custom = execSync(
          "defaults read com.apple.screencapture location",
          { encoding: "utf8" }
        ).trim();
        return [custom, path.join(home, "Desktop")];
      } catch {
        return [path.join(home, "Desktop")];
      }
    }
    case "win32": {
      return [
        path.join(home, "Pictures", "Screenshots"),
        path.join(home, "OneDrive", "Pictures", "Screenshots"),
      ].filter(p => require("fs").existsSync(p));
    }
    case "linux": {
      return [
        path.join(home, "Pictures"),
        path.join(home, "Pictures", "Screenshots"),
      ].filter(p => require("fs").existsSync(p));
    }
    default:
      return [path.join(home, "Desktop")];
  }
}

export function isScreenshotFilename(filename: string): boolean {
  const patterns = [
    /^Screen Shot \d{4}-\d{2}-\d{2}/i,     // macOS
    /^Screenshot \d{4}-\d{2}-\d{2}/i,      // macOS (newer)
    /^Screenshot_\d{4}-\d{2}-\d{2}/i,      // Windows/Linux
    /^Screenshot from \d{4}-\d{2}-\d{2}/i, // GNOME
    /^CleanShot/,                           // CleanShot X
    /^Shottr/,                              // Shottr
    /^Snip/i,                               // Windows Snip
    /^\d{4}-\d{2}-\d{2}.*screenshot/i,     // Flameshot
  ];
  return patterns.some(p => p.test(filename));
}
```

### 17.2 Upload with retry

```typescript
// electron/services/uploader.ts
import FormData from "form-data";
import fs from "fs";
import axios, { AxiosError } from "axios";

const API_URL = process.env.API_URL ?? "https://api.snaplink.io";

export async function uploadFile(
  filepath: string,
  token: string | null,
  opts: { burnAfterRead?: boolean; ocr?: boolean } = {}
): Promise<{ id: string; url: string }> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(filepath));
      form.append("burn_after_read", String(opts.burnAfterRead ?? false));
      form.append("ocr", String(opts.ocr ?? true));
      
      const response = await axios.post(`${API_URL}/api/v1/upload`, form, {
        headers: {
          ...form.getHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Client-Version": app.getVersion(),
          "X-Platform": process.platform,
        },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      
      return response.data;
    } catch (error) {
      lastError = error as Error;
      if (error instanceof AxiosError && error.response?.status === 413) {
        throw error; // don't retry
      }
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }
  
  throw lastError;
}
```

### 17.3 Short ID generation

```typescript
// backend/lib/shortid.ts
import { customAlphabet } from "nanoid";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const RESERVED = new Set([
  "api", "www", "admin", "app", "raw", "go", "p", "i",
  "help", "docs", "terms", "privacy", "login", "signup", "pricing",
  "blog", "about", "contact", "support",
]);

const gen = customAlphabet(ALPHABET, 6);

export async function generateShortId(
  prisma: PrismaClient,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const id = gen();
    if (RESERVED.has(id.toLowerCase())) continue;
    
    const existing = await prisma.upload.findUnique({
      where: { shortId: id },
      select: { id: true },
    });
    if (!existing) return id;
  }
  throw new Error("Failed to generate unique shortId");
}
```

---

## 18. Deliverables Checklist

When development is complete, verify:

### Desktop app

- [ ] Installs cleanly on macOS 12+, Windows 10+, Ubuntu 22.04+
- [ ] Auto-starts at login (optional, user opt-in)
- [ ] Tray/menu bar icon works
- [ ] File watcher detects screenshots from OS native tools
- [ ] File watcher detects screenshots from CleanShot X, ShareX, Flameshot
- [ ] Upload completes in <2s on 10 Mbps connection
- [ ] URL is in clipboard after upload
- [ ] Native notification fires
- [ ] Global hotkey for clipboard upload works
- [ ] Settings persist across restarts
- [ ] Auto-updater detects new version
- [ ] Code-signed on macOS (Gatekeeper passes)
- [ ] Code-signed on Windows (SmartScreen not flagging after 2 weeks)
- [ ] Protocol handler `snaplink://` registered on all platforms

### Backend

- [ ] Upload endpoint handles 20MB files
- [ ] Short URL resolves in <100ms globally
- [ ] OCR completes for typical screenshots in <5s
- [ ] Rate limiting enforces per-tier limits
- [ ] NSFW classifier rejects obvious violations
- [ ] Auto-cleanup of expired uploads runs daily
- [ ] Database migrations reversible
- [ ] All endpoints return proper HTTP status codes

### Infrastructure

- [ ] HTTPS enforced everywhere
- [ ] CDN cache headers correct
- [ ] R2 bucket lifecycle rule active
- [ ] Postgres backups configured (daily, 30-day retention)
- [ ] Sentry capturing errors from all 3 platforms + backend
- [ ] PostHog tracking key events
- [ ] Status page live (status.snaplink.io)

### Distribution

- [ ] Direct download on snaplink.io for all 3 platforms
- [ ] Homebrew Cask PR merged
- [ ] Winget manifest merged
- [ ] Snap Store listing live
- [ ] Flathub listing live
- [ ] GitHub Releases auto-publishing on tag push

### Documentation

- [ ] `/docs/getting-started` for each platform
- [ ] `/docs/mcp-server` integration guide
- [ ] `/docs/api-reference` for developer API
- [ ] Privacy policy + ToS on website
- [ ] README with install instructions

---

**END OF SPECIFICATION**

This document is the source of truth for SnapLink v1 development. Follow implementation order strictly. When in doubt about Electron / cross-platform specifics, match patterns used by VS Code, Linear, or Raycast (all Electron apps with similar quality bar).# screenshot
