# Utiliser une image Node plus légère avec Chrome
FROM node:18-alpine

# Installer Chrome et les dépendances système
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN npm ci --omit=dev

# Copier le reste des fichiers
COPY . .

# Exposer le port (si nécessaire)
EXPOSE 3000

# Démarrer l'application
CMD ["npm", "start"]

