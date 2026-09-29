# syntax=docker/dockerfile:1
# Multi-stage build of the PolyMirror backend. Build context: repository root.
FROM node:22-alpine AS build
WORKDIR /repo
RUN apk add --no-cache openssl && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/backend/prisma apps/backend/prisma
RUN pnpm install --frozen-lockfile --filter @polymirror/backend...
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @polymirror/backend build \
 && pnpm deploy --filter @polymirror/backend --prod --legacy /out \
 && cp -r apps/backend/dist /out/dist \
 && cd /out && npx prisma generate --schema prisma/schema.prisma

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
COPY --from=build /out /app
USER app
EXPOSE 4000
# Apply pending migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/server.js"]
