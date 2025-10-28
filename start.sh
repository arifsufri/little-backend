#!/bin/sh
set -e
npx prisma db push
node dist/index.js
