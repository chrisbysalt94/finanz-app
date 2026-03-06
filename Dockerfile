ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2
FROM ${BUILD_FROM}

# Node.js runtime
RUN apk add --no-cache nodejs npm

# Build tools for better-sqlite3 native compilation
RUN apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app

# Install dependencies first (cached layer)
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Remove build tools, keep runtime lib
RUN apk del .build-deps && \
    apk add --no-cache libstdc++

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Entrypoint
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
