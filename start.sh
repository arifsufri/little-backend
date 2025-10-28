#!/bin/sh
set -e
echo "=== Environment Debug ==="
echo "DATABASE_URL: ${DATABASE_URL}"
echo "NODE_ENV: ${NODE_ENV}"
echo "PORT: ${PORT}"
echo "========================="
echo "Running database migrations..."
npx prisma migrate deploy
echo "Starting application..."
node dist/index.js
