# Use Node.js LTS as the base image
FROM node:23-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    addgroup -S nodejs && adduser -S nodejs -G nodejs


# Set working directory
WORKDIR /monorepo

# Copy package files for better caching
FROM base AS deps
COPY --chown=nodejs:nodejs pnpm-lock.yaml ./
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs turbo.json ./

# Copy workspaces
COPY --chown=nodejs:nodejs apps/ ./apps
COPY --chown=nodejs:nodejs packages/ ./packages
COPY --chown=nodejs:nodejs shell/ ./shell

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM deps AS builder
# Build all workspaces
RUN pnpm build

# Production stage
FROM base AS runner
WORKDIR /monorepo

# Copy built files from builder with proper permissions
COPY --from=builder --chown=nodejs:nodejs /monorepo/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /monorepo/apps ./apps
COPY --from=builder --chown=nodejs:nodejs /monorepo/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /monorepo/shell ./shell
COPY --from=builder --chown=nodejs:nodejs /monorepo/turbo.json ./

# Switch to non-root user
USER nodejs

# Expose the port your app runs on
EXPOSE 5555

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5555/health || exit 1

# Start the application
CMD ["pnpm", "start"]