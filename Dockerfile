# Utilise l'image Node.js officielle basée sur Alpine Linux
FROM node:18-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production && npm cache clean --force

# Copier le code source
COPY src/ ./src/
COPY sql/ ./sql/

# Copier les fichiers de configuration
COPY .env.production ./.env

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S gsc-connector -u 1001

# Changer la propriété des fichiers
RUN chown -R gsc-connector:nodejs /app
USER gsc-connector

# Exposer le port
EXPOSE 3000

# Variables d'environnement par défaut - Mode stateless
ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/gsc-connector
ENV SKIP_DB_SAVE=true
ENV SKIP_DB_INIT=true
ENV SKIP_REDIS=true

# Commande de démarrage
CMD ["node", "src/app.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { \
      host: 'localhost', \
      port: process.env.PORT || 3000, \
      path: (process.env.BASE_PATH || '') + '/health', \
      timeout: 2000 \
    }; \
    const request = http.request(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); \
      else process.exit(1); \
    }); \
    request.on('error', () => process.exit(1)); \
    request.end();"