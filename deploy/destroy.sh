#!/usr/bin/env bash
# Removes the Gauge Room demo from the VPS completely: containers, database, uploaded files, images,
# the Caddy site block and /opt/gauge-room. Other apps on the server are not touched.
# Run from your own machine:  ./deploy/destroy.sh            (asks for confirmation)
#   DEPLOY_HOST (default 187.127.130.103), SSH_KEY (default ~/.ssh/id_rsa_3dot14)
# NB: the next push to main deploys a fresh copy again. Disable the Deploy workflow on GitHub to stop that.
set -euo pipefail

HOST="${DEPLOY_HOST:-187.127.130.103}"
KEY="${SSH_KEY:-$HOME/.ssh/id_rsa_3dot14}"

echo "This permanently deletes the Gauge Room demo on $HOST, including its database and uploaded files."
read -r -p "Type DELETE to continue: " answer
[ "$answer" = "DELETE" ] || { echo "Aborted."; exit 1; }

ssh -i "$KEY" "root@$HOST" bash -s <<'REMOTE'
set -euo pipefail
APP_DIR=/opt/gauge-room
CADDYFILE=/opt/r2r/Caddyfile
CADDY_CONTAINER=r2r-caddy-1

# 1. Caddy first, so the domain stops routing before the app disappears.
if grep -q '^# >>> gauge-room' "$CADDYFILE"; then
  echo "==> Removing Caddy site block"
  new=$(mktemp)
  awk '/^# >>> gauge-room/{skip=1} !skip{print} /^# <<< gauge-room/{skip=0}' "$CADDYFILE" > "$new"
  sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$new"
  docker exec -i "$CADDY_CONTAINER" sh -c 'cat > /tmp/Caddyfile.check && caddy validate --adapter caddyfile --config /tmp/Caddyfile.check' < "$new"
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d%H%M%S)"
  cat "$new" > "$CADDYFILE" # keep the inode: the Caddy container bind-mounts this file
  docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  rm -f "$new"
fi

# 2. Containers, volumes (database + files) and networks.
if [ -f "$APP_DIR/docker-compose.yml" ]; then
  echo "==> Removing containers and volumes"
  cd "$APP_DIR"
  touch .env .deploy.env
  docker compose --env-file .env --env-file .deploy.env down --volumes --remove-orphans
  cd /
fi

# 3. Images and files.
echo "==> Removing images and $APP_DIR"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^ghcr.io/vishnuprabhakar42/go-unmanual-gauge-room:' | xargs -r docker rmi -f >/dev/null
rm -rf "$APP_DIR"
echo "==> Gauge Room removed."
REMOTE
