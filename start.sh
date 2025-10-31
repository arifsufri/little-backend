#!/bin/sh
set -e
echo "=== Environment Debug ==="
echo "DATABASE_URL: ${DATABASE_URL}"
echo "NODE_ENV: ${NODE_ENV}"
echo "PORT: ${PORT}"
echo "========================="
echo "ABOUT TO RUN FIX-DB SCRIPT"
node fix-db.js
echo "FIX-DB SCRIPT COMPLETED"
echo "Generating Prisma client..."
npx prisma generate
echo "Starting application..."
node dist/index.js
