#!/usr/bin/env bash
# Runs ON the VPS (called by .github/workflows/deploy.yml over SSH). Idempotent: safe on a fresh server or after destroy.
#   GAUGE_IMAGE  image to run, e.g. ghcr.io/owner/repo:<sha>
#   GHCR_USER    registry user; the registry token arrives on stdin
set -euo pipefail

APP_DIR=/opt/gauge-room
CADDYFILE=/opt/r2r/Caddyfile
CADDY_CONTAINER=r2r-caddy-1
: "${GAUGE_IMAGE:?GAUGE_IMAGE is required}"

cd "$APP_DIR"

# 1. Secrets: generated once on the server, never stored in git or GitHub.
if [ ! -f .env ]; then
  echo "==> Creating .env with fresh secrets"
  umask 077
  cat > .env <<EOF
POSTGRES_USER=gauge
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=gauge_room
APP_URL=https://gauge.gounmanual.com
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_TRUST_HOST=true
TZ=Asia/Kolkata
SMTP_HOST=
EMAIL_FROM="Go Unmanual <no-reply@gounmanual.com>"
WHATSAPP_PROVIDER=console
STORAGE_DRIVER=local
STORAGE_DIR=storage
AI_CERT_EXTRACTION=false
AI_HEADER_MAPPING=false
EOF
fi
echo "GAUGE_IMAGE=$GAUGE_IMAGE" > .deploy.env
compose() { docker compose --env-file .env --env-file .deploy.env "$@"; }

# 2. Pull the new image (token only lives for this job; log out afterwards).
echo "==> Pulling $GAUGE_IMAGE"
if [ -n "${GHCR_USER:-}" ] && [ ! -t 0 ]; then
  docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi
compose pull app worker

# 3. Start / update. --wait returns once the app passes its health check (migrations run on start).
echo "==> Starting containers"
compose up -d --wait --wait-timeout 300 --remove-orphans

# 4. Demo data: the seed skips itself when the demo company already exists.
echo "==> Seeding demo data (no-op if already seeded)"
compose exec -T -e ALLOW_DEMO_SEED=true app pnpm db:seed

# 5. Shared Caddy: install/refresh our site block between the markers. Write with `cat >` so the
#    file keeps its inode (the Caddy container bind-mounts it), validate first, roll back on failure.
echo "==> Updating Caddy site block"
new=$(mktemp)
awk '/^# >>> gauge-room/{skip=1} !skip{print} /^# <<< gauge-room/{skip=0}' "$CADDYFILE" > "$new"
sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$new" # trim trailing blank lines
printf '\n' >> "$new"
cat gauge-room.caddy >> "$new"
if cmp -s "$new" "$CADDYFILE"; then
  echo "    unchanged"
else
  docker exec -i "$CADDY_CONTAINER" sh -c 'cat > /tmp/Caddyfile.check && caddy validate --adapter caddyfile --config /tmp/Caddyfile.check' < "$new"
  backup="$CADDYFILE.bak-$(date +%Y%m%d%H%M%S)"
  cp "$CADDYFILE" "$backup"
  cat "$new" > "$CADDYFILE"
  if ! docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    echo "!!  Caddy reload failed, restoring $backup" >&2
    cat "$backup" > "$CADDYFILE"
    docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    exit 1
  fi
fi
rm -f "$new"

# 6. Keep disk usage in check on the shared server: drop older images of this app.
docker images "${GAUGE_IMAGE%:*}" --format '{{.Repository}}:{{.Tag}}' | grep -vxF "$GAUGE_IMAGE" | xargs -r docker rmi >/dev/null 2>&1 || true

echo "==> Deployed $GAUGE_IMAGE"
compose ps
