# Stage 1: Build native modules
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Runtime (hardcoded node:20-alpine, ignores HA BUILD_FROM)
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/backend/node_modules ./backend/node_modules/

COPY backend/ ./backend/
COPY frontend/ ./frontend/

ENV DATA_PATH=/config/finanz-app

CMD ["sh", "-c", "mkdir -p /config/finanz-app && exec node backend/server.js"]
