# Utiliser une image Node avec Chrome pré-installé
FROM ghcr.io/puppeteer/puppeteer:21.0.0

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances (sans télécharger Chrome car déjà dans l'image)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci --omit=dev

# Copier le reste des fichiers
COPY . .

# Exposer le port (si nécessaire)
EXPOSE 3000

# Démarrer l'application
CMD ["npm", "start"]

