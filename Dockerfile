# Go Unmanual · Gauge Room — one image for both the web app and the background worker.
FROM node:24-bookworm-slim AS base
ENV TZ=Asia/Kolkata \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app

FROM base AS build
# Placeholders for install/build only (this stage's ENV does not reach the runtime image)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-only-secret-build-only-secret"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate && pnpm build

FROM base AS runtime
# Run the project's binaries directly: pnpm at runtime would re-download itself for the `node` user and
# re-verify node_modules (which `node` cannot write) on every container start.
ENV NODE_ENV=production PORT=3000 PATH=/app/node_modules/.bin:$PATH
COPY --from=build /app /app
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
# Web app (applies pending DB migrations first). The worker service overrides this with `tsx src/worker/index.ts`.
CMD ["sh", "-c", "prisma migrate deploy && next start -p ${PORT}"]
