# Production image for the Learnify API.
#   docker build -t learnify-api ./server
#   docker run --env-file server/.env -p 4000:4000 learnify-api
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first so this layer is cached until
# package*.json actually changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Don't run as root.
USER node

EXPOSE 4000

# Orchestrators/load balancers can also hit /health directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/health" || exit 1

# `node` (not `npm start`) so SIGTERM reaches the process for graceful shutdown.
CMD ["node", "index.js"]
