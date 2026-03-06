ARG BUILD_FROM=node:20-alpine

# Stage 1: Build native modules
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Runtime
FROM ${BUILD_FROM}

WORKDIR /app

# Copy pre-built node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules/

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

ENV DATA_PATH=/config/finanz-app

CMD ["sh", "-c", "mkdir -p /config/finanz-app && exec node backend/server.js"]
