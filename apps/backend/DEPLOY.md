# Backend deploy SOP

Target: Cloudflare R2 (object storage) + Railway (Node runtime + managed Postgres).
Estimated time: ~15 minutes for a first-time deploy.

This backend is a plain Fastify + Prisma app. Anything that speaks Docker + Postgres works (Fly.io, Render, Koyeb, a VPS). Railway is documented because it has the least friction.

---

## 1. Cloudflare R2 (storage)

1. Cloudflare dashboard → R2 → **Create bucket** → name it `snaplink-uploads` (or whatever you like). Location: Automatic.
2. R2 → **Manage R2 API Tokens** → **Create API token**
   - Permissions: **Object Read & Write**
   - Specify bucket: the one you just created
   - TTL: forever
3. Copy these three values — you will not see the secret again:
   - `Access Key ID` → `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → `R2_SECRET_ACCESS_KEY`
   - The bucket endpoint shows your account ID in the URL, e.g. `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Copy `ACCOUNT_ID` → `R2_ACCOUNT_ID`.
4. (Optional, but recommended) Bucket → **Settings** → **Public Access** → Connect a custom domain (e.g. `cdn.snaplink.io`) for fast direct image delivery. Set `R2_PUBLIC_URL=https://cdn.snaplink.io`. If you skip this, images are served through the Node app via `/raw/:shortId` — still works, just not CDN-accelerated.

---

## 2. Railway (Node + Postgres)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. Railway auto-detects `railway.json` at the repo root and will build with `apps/backend/Dockerfile`.
3. In the same project: **+ New** → **Database** → **Add PostgreSQL**. Railway provisions it and exposes `DATABASE_URL` as a project variable.
4. Your backend service → **Variables** → link the `DATABASE_URL` from Postgres (Reference variable → Postgres → `DATABASE_URL`).
5. Add the rest of the env vars (see table below). Paste them into the **Raw Editor** tab for speed.
6. **Deploy**. The first deploy:
   - Builds the Docker image
   - On container start, `npm run start` runs `prisma migrate deploy` first — this applies `prisma/migrations/*` to the fresh Postgres
   - Then `node dist/server.js` listens on `$PORT` (Railway injects it)
7. Railway → **Settings** → **Networking** → **Generate Domain**. You get `your-service.up.railway.app`. Smoke test:
   ```
   curl https://your-service.up.railway.app/health
   curl https://your-service.up.railway.app/health/ready
   ```
   `/health/ready` should return `{"status":"ok","checks":{"database":{"ok":true},"storage":{"ok":true,"detail":"r2"}}}`.
8. Point your real domain (e.g. `api.snaplink.io`) → Railway **Custom Domain**, update `SHORT_URL_DOMAIN` to match, redeploy.

---

## 3. Required environment variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | From Railway Postgres (reference) |
| `NODE_ENV` | ✅ | Set to `production` |
| `PORT` | auto | Railway injects |
| `JWT_SECRET` | ✅ | Long random string, never commit |
| `SHORT_URL_DOMAIN` | ✅ | e.g. `https://snp.ink` — used in upload responses |
| `FRONTEND_URL` | ✅ | e.g. `https://snaplink.io` |
| `ALLOWED_ORIGINS` | ✅ (prod) | Comma-separated list, e.g. `https://snaplink.io,https://www.snaplink.io` |
| `R2_ACCOUNT_ID` | ⚠️ | If any R2_* is missing, backend falls back to local filesystem (fine for preview deploys, bad for production) |
| `R2_ACCESS_KEY_ID` | ⚠️ | |
| `R2_SECRET_ACCESS_KEY` | ⚠️ | |
| `R2_BUCKET_NAME` | ⚠️ | |
| `R2_PUBLIC_URL` | optional | Custom CDN domain in front of the bucket |
| `STRIPE_SECRET_KEY` | optional | Billing routes no-op without it |
| `STRIPE_WEBHOOK_SECRET` | optional | |
| `STRIPE_PRO_PRICE_ID` | optional | |
| `STRIPE_TEAM_PRICE_ID` | optional | |
| `REDIS_URL` | optional | Not required for v1 |

---

## 4. How migrations work

- `prisma/migrations/` is committed. The initial migration `20260414000000_init` creates all tables + enums + indexes + FKs.
- Production startup runs `prisma migrate deploy` (defined in `apps/backend/package.json` → `start`). This is idempotent: it applies only pending migrations, does not drop anything.
- **Never run `db:push` against production** — it bypasses the migration history and will drift from the committed schema.
- For future schema changes:
  ```bash
  # locally, pointed at a dev DB
  npm run db:migrate -w apps/backend -- --name describe_change
  git add apps/backend/prisma/migrations
  git commit -m "migration: describe_change"
  ```
  Push → Railway redeploys → `migrate deploy` applies the new migration.

---

## 5. Storage backend selection

The backend picks its storage backend at boot time in `apps/backend/src/services/storage.ts`:

- If **all** of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` are set → R2 (S3-compatible).
- Otherwise → local filesystem at `$LOCAL_STORAGE_DIR` (defaults to `./uploads`).

`GET /health/ready` reports which one is active (`checks.storage.detail` = `"r2"` or `"local"`).

Local mode is fine for `npm run dev` and CI. **Do not run production on local mode** — Railway containers have ephemeral disks, so uploads vanish on redeploy.

---

## 6. Alternative hosts

The repo is host-agnostic. If you're not on Railway:

- **Fly.io**: `fly launch --dockerfile apps/backend/Dockerfile`, attach `fly postgres create`, set env vars the same way.
- **Render**: New Web Service → Docker → set Dockerfile path `apps/backend/Dockerfile`, build context `.` (repo root). Add a Render Postgres and link `DATABASE_URL`.
- **Self-hosted / VPS**: `docker build -f apps/backend/Dockerfile -t snaplink-backend .` then `docker run` with the env vars from the table above. Postgres can be another container or managed service.

In all cases the moving parts are identical: Dockerfile, `DATABASE_URL`, R2 creds, `ALLOWED_ORIGINS`, `JWT_SECRET`.

---

## 7. Post-deploy checklist

- [ ] `curl /health` → `{"status":"ok"}`
- [ ] `curl /health/ready` → `database.ok: true`, `storage.detail: "r2"`
- [ ] Upload a test image through the desktop app → R2 bucket shows new object → short URL loads the image back
- [ ] Desktop app's backend URL points at the new deploy (`apps/desktop/electron/services/uploader.ts` constant or env)
- [ ] CORS: requests from `snaplink.io` succeed; requests from a random origin get blocked
- [ ] Railway → Logs: no Prisma connection errors, no 500s on normal traffic
