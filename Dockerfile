# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
COPY prisma ./prisma
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  else npm install; fi && \
  npx prisma generate

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
# Copy source files explicitly (excluding .env files)
COPY src ./src
COPY prisma ./prisma
COPY package.json ./
COPY tsconfig.json ./
COPY fix-db.js ./
COPY start.sh ./
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/fix-db.js ./fix-db.js
COPY start.sh ./start.sh
RUN chmod +x ./start.sh
CMD ["./start.sh"]
