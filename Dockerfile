# Stage 1: Build du Frontend React
FROM node:24-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime Serveur Centralisé
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/budget.db
ENV STATIC_DIR=/app/dist

# Outils système pour la maintenance et la vérification de santé
RUN apk add --no-cache curl sqlite

# Création du volume pour la base SQLite persistante et les logs techniques
RUN mkdir -p /app/data /app/logs

# Copie des fichiers compilés du frontend
COPY --from=builder /app/dist /app/dist

# Copie du code du backend
COPY package*.json ./
COPY server ./server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "--experimental-strip-types", "server/index.ts"]

