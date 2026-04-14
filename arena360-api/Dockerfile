# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# Force install ALL deps including devDependencies (e.g. @nestjs/cli needed for `nest build`)
# NODE_ENV=production set by Coolify would skip devDeps — override it here
RUN npm install --include=dev

COPY . .

RUN npx prisma generate
# Use npx to call nest directly from node_modules — avoids PATH issues
RUN npx nest build

# Production stage
FROM node:22-alpine

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_DISABLE_SANDBOX=true

RUN apk add --no-cache \
    openssl \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

RUN if [ ! -e /usr/bin/chromium-browser ] && [ -e /usr/bin/chromium ]; then ln -s /usr/bin/chromium /usr/bin/chromium-browser; fi

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# Coolify / Traefik: only route traffic when app responds on /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "run", "start:prod"]
