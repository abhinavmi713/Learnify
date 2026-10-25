# Learnify AI service.
#   docker build -t learnify-ai ./ai-service
#   docker run --env-file ai-service/.env -p 5001:5001 learnify-ai
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-5001}/health" || exit 1

CMD ["node", "src/index.js"]
