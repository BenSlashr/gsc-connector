#!/bin/bash

echo "🔄 Mise à jour GSC Connector"
echo "=============================="

# Copier les fichiers modifiés
echo "📂 Copie des fichiers modifiés..."
scp src/services/gscService.js debian@vps-876c8a7d:/var/www/seo-tools/gsc-connector/src/services/

echo "🔨 Reconstruction de l'image Docker sur le serveur..."
ssh debian@vps-876c8a7d "cd /var/www/seo-tools/gsc-connector && sudo docker build --no-cache -t gsc-connector:latest ."

echo "🔄 Redémarrage du conteneur..."
ssh debian@vps-876c8a7d "cd /var/www/seo-tools && sudo docker-compose restart gsc-connector"

echo "✅ Mise à jour terminée!"