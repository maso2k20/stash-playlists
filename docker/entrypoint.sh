#!/bin/sh
set -e

# Optional: wait for DB before migrating
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for database..."
  # naive wait; replace with a proper wait-for if you like
  sleep 3
  echo "Running prisma migrate..."
  npx prisma migrate deploy
fi

echo "Starting Next.js server..."
# The standalone build has a server.js at ./server.js
node server.js
