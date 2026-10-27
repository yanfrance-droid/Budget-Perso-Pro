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

# Configuration pour Puppeteer et Chromium système sous Alpine Linux
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Dépendances système :
# - curl & sqlite : santé du conteneur et maintenance locale de la base
# - chromium & polices : moteur de rendu headless pour les graphiques Donut Excel (Puppeteer)
RUN apk add --no-cache \
    curl \
    sqlite \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Création des dossiers pour les volumes persistants
RUN mkdir -p /app/data /app/logs

# Copie des fichiers de dépendances et installation stricte des modules de production
COPY package*.json ./
RUN npm ci --omit=dev

# Copie des fichiers compilés du frontend
COPY --from=builder /app/dist /app/dist

# Copie du code du backend
COPY server ./server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "--experimental-strip-types", "server/index.ts"]
