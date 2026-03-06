ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2

# Stage 1: Build native modules in Node.js Alpine
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Runtime on HA base image
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app

# Copy pre-built node_modules from builder
COPY --from=builder /app/backend/node_modules ./backend/node_modules/

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Entrypoint
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
