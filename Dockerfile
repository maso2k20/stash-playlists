# ---------- deps
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \
  else npm ci; \
  fi

# ---------- builder
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client BEFORE building Next.js
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Explicit SQLite path to avoid relative-path surprises
ENV DATABASE_URL="file:/data/prod.db"

# Prisma/Next runtime needs
RUN apk add --no-cache libc6-compat openssl

# Copy built app + node_modules + prisma
COPY --from=builder /app ./

# Ensure data dir exists (your Unraid volume will be mounted here)
RUN mkdir -p /data

# Copy entrypoint and run it via sh (no chmod on Windows needed)
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]

# Start your app (uses your package.json "start" script)
CMD ["npm", "run", "start"]

EXPOSE 3000
