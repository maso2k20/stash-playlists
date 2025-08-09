#!/bin/sh
set -e

# Ensure the SQLite parent dir exists (you’re using file:/data/prod.db)
mkdir -p /data

# Run migrations (no-ops if already applied)
npx prisma migrate deploy

# Seed (idempotent because we used upsert)
# If seed fails (e.g. table missing), print error and continue so app can still start.
if ! npx prisma db seed; then
  echo "Warning: prisma db seed failed (possibly fine on first boot before migrations?)"
fi

# Hand off to the main process (what Docker CMD sets)
exec "$@"
