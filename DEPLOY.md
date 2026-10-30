# Deploying Go Unmanual · Gauge Room

A Next.js 16 web app plus a background **worker** (emails, WhatsApp, daily digest, audit-pack PDFs), both talking to
**PostgreSQL 16+**. Uploaded certificates and generated audit packs go to local disk (a Docker volume) or an
S3-compatible bucket.

```
browser ──HTTPS──▶ reverse proxy (Caddy / nginx) ──▶ app :3000 ─┐
                                                                 ├──▶ PostgreSQL 16
                                       worker (pnpm worker) ─────┘
                       app + worker share file storage (volume or S3)
```

**Both the app and the worker must run.** Without the worker, no emails or WhatsApp messages are sent and audit packs
stay "Queued".

## Server requirements

- Linux VM, 2 vCPU / 4 GB RAM minimum (audit packs with hundreds of certificates use ~1 GB while generating), 20 GB disk
- Docker + Docker Compose v2 (option A), or Node.js 24 + pnpm 12 + PostgreSQL 16 (option B)
- A domain name pointing at the server, and an SMTP account for email (any provider: SES, Zoho, Google Workspace…)

## Option A — Docker Compose (recommended)

```bash
unzip go-unmanual-gauge-room-*.zip -d gauge-room && cd gauge-room
cp .env.production.example .env.production
nano .env.production          # set POSTGRES_PASSWORD, APP_URL, AUTH_URL, AUTH_SECRET (openssl rand -base64 32), SMTP_*, EMAIL_FROM
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs -f app worker   # "Ready" from app, "[worker] started" from worker
```

The app applies database migrations automatically on start and listens on `127.0.0.1:3000`. Put HTTPS in front, for
example with Caddy (`/etc/caddy/Caddyfile`):

```
gauge.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

or nginx (raise the body size for Excel imports and certificate uploads):

```
server {
    server_name gauge.example.com;
    client_max_body_size 30m;
    location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
}
```

**Updates:** replace the code, then `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.

## Option B — without Docker

```bash
# Node 24, pnpm 12 (corepack enable && corepack prepare pnpm@12.11.2 --activate), PostgreSQL 16 running
cp .env.production.example .env      # set DATABASE_URL instead of POSTGRES_*, plus the rest
pnpm install --frozen-lockfile
pnpm build
pnpm db:deploy                       # apply migrations (also after every update)
pnpm start -p 3000                   # web app   — run under systemd or pm2
pnpm worker                          # worker    — second systemd/pm2 service
```

Example pm2: `pm2 start "pnpm start -p 3000" --name gauge-web && pm2 start "pnpm worker" --name gauge-worker && pm2 save`.

## Demo server (automatic deploys)

The public demo at https://gauge.gounmanual.com deploys itself on every push to `main` (`.github/workflows/deploy.yml`):
CI (lint, typecheck, unit, integration, e2e) → build the image and push it to `ghcr.io/vishnuprabhakar42/go-unmanual-gauge-room` → SSH to the VPS and run `deploy/server-deploy.sh`.
Pull requests only run CI.

- The VPS is shared with other apps, so the stack (`deploy/docker-compose.yml`) lives in `/opt/gauge-room`, caps its memory, and joins the shared Caddy network `r2r_default`.
- `deploy/gauge-room.caddy` is kept in `/opt/r2r/Caddyfile` between `# >>> gauge-room` / `# <<< gauge-room` markers; the deploy validates it before reloading Caddy and rolls back on failure.
- Secrets (`POSTGRES_PASSWORD`, `AUTH_SECRET`) are generated on the server into `/opt/gauge-room/.env` on the first deploy and never leave it.
- Demo data is seeded on every deploy; the seed skips itself once the demo company exists.
- GitHub needs secrets `DEPLOY_SSH_KEY` (a key authorised for `root` on the VPS) and `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan <host>`), and variable `DEPLOY_HOST`.
- Remove the demo completely with `./deploy/destroy.sh` (asks you to type `DELETE`). The next push to `main` deploys a fresh copy; disable the Deploy workflow on GitHub to prevent that.

## First use

- **Real company:** open `https://<your-domain>/register` to create the company and first admin, then add plants and
  invite users from Settings.
- **Demo data instead** (the demo company with 600 instruments and logins `admin@demoauto.test` / `demo1234`) — only
  on a demo server, never on a real customer database:

  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.production exec -e ALLOW_DEMO_SEED=true app prisma db seed
  ```

  (Option B: `ALLOW_DEMO_SEED=true pnpm db:seed`.)

## Configuration notes

| Setting                     | Notes                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                   | Public HTTPS address; used in emails, QR labels and file links.                                                                       |
| `AUTH_URL`                  | Same value as `APP_URL`. Without it, sign-in behind the reverse proxy redirects to `localhost:3000`.                                  |
| `AUTH_SECRET`               | Random 32+ characters. Changing it signs everyone out.                                                                                |
| `SMTP_*`, `EMAIL_FROM`      | Required for sign-in links, invitations and the 09:00 IST daily digest.                                                               |
| `STORAGE_DRIVER`            | `local` keeps files in the `storage` volume (back it up). `s3` + `S3_*` for any S3-compatible bucket (AWS S3, MinIO, Cloudflare R2…). |
| `WHATSAPP_PROVIDER`         | `console` only logs messages; `meta` uses the WhatsApp Cloud API (`META_*`).                                                          |
| `AI_*`, `ANTHROPIC_API_KEY` | Optional AI certificate reading and import column matching; off by default.                                                           |
| Time zone                   | Everything runs in `Asia/Kolkata`.                                                                                                    |

Branding (company/product name, logo) is in `src/brand.ts`, `messages/en.json` (`app.*`) and `public/brand/`.

## Backups

- Database: `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U gauge gauge_room | gzip > backup-$(date +%F).sql.gz` (daily, keep 30 days off-server).
- Files: back up the `storage` Docker volume (or rely on bucket versioning with S3).

## Health & troubleshooting

- `GET /api/health` returns `200` when the app and database are up — use it for uptime monitoring.
- Emails not arriving / audit packs stuck on "Queued" → check the worker logs (`... logs -f worker`).
- Sign-in links missing → `SMTP_HOST` empty means emails are only printed to the worker/app log.
- Login rate limit: 10 attempts per 15 minutes per IP + email (in memory; run a single app instance, or put a shared
  store in front before scaling out horizontally).

## For the developer

`README.md` (setup, scripts), `CLAUDE.md` (architecture and conventions) and `docs/DECISIONS.md` (design decisions)
describe the codebase. Quality checks: `pnpm run ci` (lint, typecheck, unit + integration tests) and `pnpm test:e2e`.
