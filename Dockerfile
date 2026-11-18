# ---------- base: build tools for native modules (better-sqlite3) ----------
FROM node:24-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/backoffice/package.json apps/backoffice/

# ---------- production dependencies of the server only ----------
FROM base AS prod-deps
RUN npm ci --omit=dev -w apps/server --include-workspace-root=false

# ---------- build both apps ----------
FROM base AS build
RUN npm ci
COPY apps ./apps
RUN npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    WEB_DIST_DIR=/app/apps/backoffice/dist
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/backoffice/dist ./apps/backoffice/dist
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
