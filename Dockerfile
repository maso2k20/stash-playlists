# -------- deps
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \
  else npm ci; \
  fi

# -------- builder
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client BEFORE building Next.js
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# -------- runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma needs these at runtime on Alpine
RUN apk add --no-cache libc6-compat openssl

# Non-root user (you can override with --user 99:100 on Unraid)
RUN addgroup -S app && adduser -S app -G app

# Copy the standalone build (requires output:'standalone' in next.config)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema & migrations (db is NOT here; it's wherever your DATABASE_URL points)
COPY --from=builder /app/prisma ./prisma

# Prisma engines (client already references these)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# ✅ Bake Prisma CLI into the runtime image (so we can run migrate without npx)
RUN mkdir -p /app/node_modules/.bin
COPY --from=builder /app/node_modules/prisma /app/node_modules/prisma

USER app
EXPOSE 3000

# Healthcheck (optional)
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://localhost:3000/api/health || exit 1

# Run migrations on start, then launch Next
CMD ["sh","-c","node node_modules/prisma/build/index.js migrate deploy && node server.js"]
