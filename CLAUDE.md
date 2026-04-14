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
npm run typecheck          # same for typecheck

# Target a single workspace
npm run <script> -w apps/backend
npm run build -w packages/shared-types   # required before consumers can typecheck

# Backend / Prisma
npm run db:generate -w apps/backend
npm run db:migrate  -w apps/backend   # dev migrations
npm run db:push     -w apps/backend   # prototype (no migration file)

# Desktop installer (local)
npm run release -w apps/desktop       # electron-builder, current OS only
```

There is no test runner wired up yet. If you add one, update this file.

## Desktop architecture (apps/desktop)

Two-process Electron app. Never import Node APIs from renderer code — cross the boundary through `preload.ts`.

- **Main process** (`electron/main.ts`) owns: file watcher, global hotkeys, tray, native notifications, auto-updater, OS keychain (via `keytar`), HTTPS to backend. Entry point listed in `apps/desktop/package.json` as `dist-electron/main.js`.
- **IPC handlers** live one-file-per-feature in `electron/ipc/` (`upload`, `auth`, `settings`, `billing`, `feedback`). Each file exports a `register…IPC()` called from `main.ts`.
- **Services** in `electron/services/` are the reusable units the IPC handlers compose (`watcher`, `clipboard`, `uploader`, `hotkeys`, `tray`, `notifications`, `updater`, `store`, `keychain`).
- **Platform shims** in `electron/platform/` (`darwin.ts`, `win32.ts`, `linux.ts`, `detect.ts`) encapsulate per-OS screenshot folder detection, hotkey conventions, etc. Always add new OS-sensitive logic behind this abstraction rather than sprinkling `process.platform` checks.
- **Renderer** (`src/`) is plain React + Zustand + Tailwind. The bridge object exposed on `window.snaplink` is typed in `src/lib/ipc-bridge.ts` — it has both the real implementation (calling `window.electron.invoke`) and a mock path for running the renderer outside Electron (`npm run dev` with Vite only).
- Two TS configs: `tsconfig.json` for the renderer (DOM), `tsconfig.electron.json` for main/preload (Node). Both must pass during `typecheck`.

## Backend architecture (apps/backend)

Fastify with plugins registered in `src/server.ts`. Concerns are separated:

- `routes/` — thin HTTP handlers; one file per resource (`upload`, `auth`, `serve`, `report`, `billing`, `feedback`, `health`).
- `services/` — IO-bound logic reused across routes (`storage` for R2, `ocr` for Tesseract, `stripe`, `exif`, `moderation`).
- `middleware/` — `auth` (device-token bearer) and `plan-gate` (enforces Free/Pro/Team limits).
- `jobs/cleanup.ts` — scheduled tasks (expired burn-after-read, soft-deleted rows).
- `lib/` — shared primitives: the `prisma` singleton, `shortid` generator, `image` helpers. Always import the prisma client from `src/lib/prisma.ts`, never `new PrismaClient()` at the call site.

Database: Postgres via Prisma. Schema in `prisma/schema.prisma` defines `User`, `Device`, `Upload`, `OCR`, `Project`, `Feedback`, plan/role enums. After changing the schema, run `db:generate` to refresh the client, then `db:migrate` to create a migration.

## Web site (apps/web)

Astro 4 + Tailwind + MDX. The marketing pages (`pages/index.astro`, `pricing`, `support`) are hand-authored Astro; docs and legal pages are MDX (`pages/docs/*.mdx`, `pages/legal/*.mdx`) rendered through `layouts/Doc.astro`. The feedback form on `/support` POSTs to the backend's `/api/v1/feedback` endpoint.

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
6. Icon files (`build/icon.ico` / `.icns` / `.png`) are intentionally commented out in `electron-builder.yml` until branding assets land.
