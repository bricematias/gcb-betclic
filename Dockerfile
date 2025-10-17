# Image Node ultra-légère
FROM node:18-alpine

# Installer uniquement Chromium (plus léger que Chrome)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances (sans télécharger Chrome)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN npm ci --omit=dev

# Copier le reste des fichiers
COPY . .

# Exposer le port (si nécessaire)
EXPOSE 3000

# Démarrer l'application
CMD ["npm", "start"]

