FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run db:generate && npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev && npm run db:generate

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

CMD ["sh", "-c", "echo '=== MIGRATE ===' && npx prisma migrate deploy && echo '=== START BOT ===' && node dist/index.js 2>&1 || echo '=== CRASHED ==='"]
