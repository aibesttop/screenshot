# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

`README.md` is the full product + technical specification (60KB, numbered sections). When making non-trivial changes, re-read the relevant section — decisions like the <500ms screenshot→URL latency budget, pricing tiers, OCR pipeline, and privacy model are specified there and should not be contradicted by code changes.

## Repository shape

npm workspaces monorepo. Node >= 20. **There is intentionally no committed `package-lock.json` yet** — CI uses `npm install`, not `npm ci`.

```
apps/
  desktop/     Electron + React + Vite — the product
  backend/     Fastify + Prisma + Postgres — upload/auth/OCR/billing API
  web/         Astro site — marketing, docs, legal, launch kit
packages/
  shared-types/  TS types shared between desktop/backend (build with tsc)
  mcp-server/    Standalone npm bin (`snaplink-mcp`) — MCP server for Claude/Cursor
```

## Common commands

Run everything from the repo root — workspaces flags route to the right package.

```bash
# Dev (one per terminal)
npm run dev:desktop        # Electron + Vite with HMR
npm run dev:backend        # Fastify with tsx watch
npm run dev:web            # Astro dev server

# Build
npm run build:desktop      # tsc + vite build + tsc -p tsconfig.electron.json
npm run build:backend      # tsc
npm run build:web          # astro build

# Workspace-wide
npm run lint               # runs lint in every workspace that has it
npm run typecheck          # same for typecheck — all 5 workspaces should pass

# Target a single workspace
npm run <script> -w apps/backend
npm run build -w packages/shared-types   # required before consumers can typecheck

# Backend / Prisma
npm run db:generate -w apps/backend
npm run db:migrate  -w apps/backend   # dev migrations (creates files under prisma/migrations/)
npm run db:push     -w apps/backend   # prototype only — never use against production

# Desktop installer (local)
npm run release -w apps/desktop       # electron-builder, current OS only
```

There is no test runner wired up yet. If you add one, update this file.

## Desktop architecture (apps/desktop)

Two-process Electron app. Never import Node APIs from renderer code — cross the boundary through `preload.ts`.

- **Main process** (`electron/main.ts`) owns: file watcher, global hotkeys, tray, native notifications, auto-updater, OS keychain (via `keytar`), HTTPS to backend, plus the smart-paste orchestrator. Entry point listed in `apps/desktop/package.json` as `dist-electron/main.js`.
- **IPC handlers** live one-file-per-feature in `electron/ipc/` (`upload`, `auth`, `settings`, `billing`, `feedback`). Each file exports a `register…IPC()` called from `main.ts`.
- **Services** in `electron/services/` are the reusable units the main process and IPC handlers compose (`watcher`, `clipboard`, `uploader`, `hotkeys`, `tray`, `notifications`, `updater`, `store`, `keychain`, `region-capture`, `paste-picker`, `smart-paste`).
- **Platform shims** in `electron/platform/` (`darwin.ts`, `win32.ts`, `linux.ts`, `detect.ts`, `focused-app.ts`) encapsulate per-OS screenshot folder detection, foreground app detection, hotkey conventions, etc. Always add new OS-sensitive logic behind this abstraction rather than sprinkling `process.platform` checks.
- **Renderer** (`src/`) is plain React + Zustand + Tailwind. The bridge object exposed on `window.snaplink` is typed in `src/lib/ipc-bridge.ts` — it has both the real implementation (calling `window.electron.invoke`) and a mock path for running the renderer outside Electron (`npm run dev` with Vite only).
- Two TS configs: `tsconfig.json` for the renderer (DOM), `tsconfig.electron.json` for main/preload (Node, `composite: true` because the renderer config references it). Both must pass during `typecheck`.

### Smart-paste flow (Ctrl/Cmd+Shift+V)

The flagship desktop feature is its own mini-subsystem:

1. `platform/focused-app.ts` detects the foreground app *before* we steal focus (osascript on macOS, PowerShell + GetForegroundWindow on Windows, xdotool on Linux — all best-effort, fail-quiet). It also classifies known apps into IMAGE_FRIENDLY vs TEXT_ONLY so the picker can pre-highlight a sensible default.
2. `services/region-capture.ts` opens a transparent full-screen overlay on the primary display (backdrop = `desktopCapturer` PNG), user drags a rect, we crop via `nativeImage.crop()`. HiDPI: overlay rect is in CSS pixels, crop is in physical pixels — multiply by `scaleFactor`.
3. `services/paste-picker.ts` opens a compact 420×300 window offering "Paste image" vs "Paste URL".
4. `services/smart-paste.ts` orchestrates. On "image": `clipboard.writeImage`. On "URL": uploads via the normal uploader, writes a short link using `settings.copyFormat`. The user then presses Ctrl+V themselves in the target app — we do NOT synthesize keystrokes (would need a native dep).

**Internal-UI window pattern**: the region overlay and picker both write their HTML to `os.tmpdir()` as a file, then `BrowserWindow.loadFile()` with `nodeIntegration: true` and `contextIsolation: false`. This is safe because the HTML is 100% generated by us (never remote content), and it lets the tiny inline `<script>` reach `ipcRenderer` without a dedicated preload. Don't replicate this pattern for the main app window.

Hotkey defaults live in `services/store.ts`:
- `CmdOrCtrl+Shift+V` → smart-paste (region capture → picker)
- `Alt+Shift+V` → upload clipboard image (the pre-smart-paste behavior)
- `CmdOrCtrl+Shift+H` → toggle history window
- `CmdOrCtrl+Shift+P` → pause auto-upload

## Backend architecture (apps/backend)

Fastify with plugins registered in `src/server.ts`. Concerns are separated:

- `routes/` — thin HTTP handlers; one file per resource (`upload`, `auth`, `serve`, `report`, `billing`, `feedback`, `health`).
- `services/` — IO-bound logic reused across routes (`storage` for R2, `ocr` for Tesseract, `stripe`, `exif`, `moderation`).
- `middleware/` — `auth` (device-token bearer) and `plan-gate` (enforces Free/Pro/Team limits).
- `jobs/cleanup.ts` — scheduled tasks (expired burn-after-read, soft-deleted rows).
- `lib/` — shared primitives: the `prisma` singleton, `shortid` generator, `image` helpers. Always import the prisma client from `src/lib/prisma.ts`, never `new PrismaClient()` at the call site.

Database: Postgres via Prisma. Schema in `prisma/schema.prisma` defines `User`, `Device`, `Upload`, `Project`, `ProjectMember`, `Feedback`, plus the `Plan`, `Role`, `OcrStatus`, and `FeedbackCategory` enums. OCR fields (`ocrText`, `ocrLang`, `ocrStatus`) live on `Upload` — there is no separate `OCR` model. After changing the schema, run `db:generate` to refresh the client, then `db:migrate` to create a migration file.

### Storage backend selection

`services/storage.ts` picks its backend at boot based on env vars. If **all** of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` are set → Cloudflare R2 via `@aws-sdk/client-s3`. Otherwise → local filesystem at `$LOCAL_STORAGE_DIR` (defaults to `./uploads`). `GET /health/ready` reports which is active. Never run production in local mode — Railway/Fly containers have ephemeral disks.

### Production start + CORS

`package.json`'s `start` script runs `prisma migrate deploy && node dist/server.js`, so fresh deploys apply pending migrations automatically. `prisma` is in `dependencies` (not devDependencies) specifically for this reason.

CORS is strict in production: set `ALLOWED_ORIGINS` to a comma-separated list. Requests without an `Origin` header (desktop app, curl) are always allowed. In non-production mode, all origins are allowed.

### Deployment

See `apps/backend/DEPLOY.md` for the full Railway + R2 SOP. The deploy artifacts — `apps/backend/Dockerfile`, `railway.json` at the repo root, `.dockerignore` files at both root and `apps/backend/` — are set up so Railway auto-detects the config and builds from the monorepo root (build context = repo root, Dockerfile path = `apps/backend/Dockerfile`).

## Web site (apps/web)

Astro 4 + Tailwind + MDX. The marketing pages (`pages/index.astro`, `pricing`, `support`) are hand-authored Astro; docs and legal pages are MDX (`pages/docs/*.mdx`, `pages/legal/*.mdx`) rendered through `layouts/Doc.astro`. The feedback form on `/support` POSTs to the backend's `/api/v1/feedback` endpoint. `components/DownloadButtons.astro` is platform-aware (reads `navigator.userAgent` in a client `<script>`) to show the right OS label by default.

`@astrojs/sitemap` is intentionally NOT used — it has an upstream bug on Astro 4.16 (`_routes.reduce` crash). Don't re-add it without verifying upstream has fixed it.

## Shared types

`packages/shared-types` is referenced as `@snaplink/shared-types` from both desktop and backend. It must be built (`npm run build -w packages/shared-types`) before its `dist/` exists — CI does this explicitly, and local `typecheck` will fail without it on a fresh clone.

## MCP server

`packages/mcp-server` compiles to a standalone `dist/index.js` with a `snaplink-mcp` bin entry. It's meant to be `npx`'d from Claude/Cursor config, not imported. It talks to the backend via the same device-token auth as the desktop app.

## CI / Windows build specifics

`.github/workflows/build-windows.yml` produces an unsigned NSIS installer + portable .exe artifact. Several non-obvious things here — **don't remove these defenses without understanding what they're for**:

1. **`npm install --include=optional`** at the root, not `npm ci`. No lockfile yet.
2. **Defender exclusion** on the workspace — without it, `7zip-bin/win/x64/7za.exe` can get quarantined mid-install and cause `ENOENT ... chmod 7za.exe` later.
3. **7zip-bin repair step** — force-reinstalls the package and falls back to downloading `7za.exe` directly from `develar/7zip-bin` on GitHub if npm won't place it.
4. **Nested electron install in `apps/desktop`** — npm workspaces hoist `electron` to the root, but electron-builder's `computeElectronVersion` sometimes fails to walk up, so we also install it with `--install-strategy=nested` into `apps/desktop/node_modules`.
5. **`electron-builder.yml` sets `npmRebuild: false`** — this disables electron-builder's own `npm install --production` in appDir. That step would otherwise prune devDependencies from the *root* `node_modules`, deleting `7zip-bin` right before packaging needs it. Consequence: native modules (currently only `keytar`) must be rebuilt manually. CI runs `@electron/rebuild -w keytar -v 30.5.1` to do this; keep that step in sync with the `electron` version pinned in `apps/desktop/package.json` (currently exact `30.5.1`).
6. Icon files (`build/icon.ico` / `.icns` / `.png`) are intentionally commented out in `electron-builder.yml` until branding assets land; a minimal `build/tray-icon.png` IS committed and gets shipped to `process.resourcesPath/build/` via `extraResources`.
7. `electron-builder.yml` also declares the `snaplink://` custom protocol for deep links (Windows reads it at install time; macOS/Linux are handled by `app.setAsDefaultProtocolClient` at runtime in `main.ts`).

## Packaged-build gotchas

If the renderer goes blank in a packaged build, the cause is almost always asset paths: `apps/desktop/vite.config.ts` must set `base: "./"` so Vite emits relative `<script src="./assets/...">` URLs that resolve under `file://`. Absolute paths (`/assets/...`) break because `file://` resolves them to the filesystem root. `main.ts` opens DevTools automatically on `did-fail-load` so this is self-diagnosing.
