# Production image for the Learnify API.
#   docker build -t learnify-api ./server
#   docker run --env-file server/.env -p 4000:4000 learnify-api
FROM node:22-alpine

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

# The same image runs the API (node index.js) and the worker
# (node workers/index.js); the script checks whichever one is PID 1.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "scripts/healthcheck.js"]

# `node` (not `npm start`) so SIGTERM reaches the process for graceful shutdown.
CMD ["node", "index.js"]
