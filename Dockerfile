# Root Dockerfile for Coolify: build and run arena360-api from repo root context
FROM node:22-alpine AS builder
WORKDIR /app
COPY arena360-api/package*.json ./
COPY arena360-api/prisma ./prisma/
RUN npm install
COPY arena360-api/ .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000

# Coolify / Traefik: only route traffic when app responds on /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "run", "start:prod"]
