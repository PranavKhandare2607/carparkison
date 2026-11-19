# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

FROM base AS builder
ENV PORT=3000 \
    BASE_PATH=/ \
    NODE_ENV=production \
    CI=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/parkinson-care-ai run build

FROM base AS api
ENV PORT=3000 \
    NODE_ENV=production
COPY --from=builder /app /app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/artifacts/parkinson-care-ai/dist/public /usr/share/nginx/html
EXPOSE 80
