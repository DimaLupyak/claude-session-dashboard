# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY apps/web/package.json apps/web/package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY apps/web/ ./

# Build the application
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine

WORKDIR /app

# Copy build output and CLI entry point
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install production dependencies only
RUN npm ci --omit=dev

# Run as non-root user for security
USER node

# The app reads ~/.claude which will be mounted as a volume.
# When running as the 'node' user, HOME is /home/node.
EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "bin/cli.mjs", "--host", "0.0.0.0"]
