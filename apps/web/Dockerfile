FROM node:20-alpine AS base
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/mqtt-topics/package.json packages/mqtt-topics/package.json
# @weighbridge/database's postinstall hook runs `node prisma-runner.js generate`
# during `npm ci` below — it needs the runner script and the schema it points
# at present before that happens, not just the package.json files.
COPY packages/database/prisma-runner.js packages/database/prisma-runner.js
COPY packages/database/schema.prisma packages/database/schema.prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --fund=false --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM base AS builder
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm --workspace @weighbridge/web run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /workspace ./
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /workspace
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "npm --workspace @weighbridge/database run migrate:deploy && npm --workspace @weighbridge/web run start"]
