#!/bin/bash

# Script de déploiement GSC Connector
set -e

echo "🚀 Déploiement GSC Connector"
echo "==============================="

# Configuration
CONTAINER_NAME="gsc-connector"
IMAGE_NAME="gsc-connector:latest"

echo "📋 Étape 1: Vérification des pré-requis"
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé"
    exit 1
fi

if [ ! -f ".env.production" ]; then
    echo "❌ Fichier .env.production manquant"
    echo "💡 Copiez et configurez .env.production avec vos vraies valeurs"
    exit 1
fi

echo "✅ Pré-requis OK"

echo "🔨 Étape 2: Construction de l'image Docker"
docker build -t $IMAGE_NAME .
echo "✅ Image construite: $IMAGE_NAME"

echo "🛑 Étape 3: Arrêt du conteneur existant (si présent)"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "🚀 Étape 4: Démarrage du nouveau conteneur"
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e BASE_PATH=/gsc-connector \
  $IMAGE_NAME

echo "⏳ Attente du démarrage..."
sleep 10

echo "🔍 Étape 5: Vérification"
if curl -f -s http://localhost:3000/gsc-connector/health > /dev/null; then
    echo "✅ Service accessible"
else
    echo "⚠️  Health check échoué (normal sans DB)"
fi

if curl -f -s http://localhost:3000/gsc-connector/ > /dev/null; then
    echo "✅ Endpoint racine accessible"
else
    echo "❌ Endpoint racine inaccessible"
    exit 1
fi

echo "📊 Étape 6: Informations du déploiement"
echo "Container ID: $(docker ps -q -f name=$CONTAINER_NAME)"
echo "Image: $IMAGE_NAME"
echo "Port: 3000"
echo "Base Path: /gsc-connector"

echo ""
echo "🎯 Déploiement terminé avec succès!"
echo "📝 Endpoints disponibles:"
echo "   - Root: http://localhost:3000/gsc-connector/"
echo "   - Health: http://localhost:3000/gsc-connector/health"
echo "   - Auth: http://localhost:3000/gsc-connector/auth/url"
echo ""
echo "📋 Commandes utiles:"
echo "   - Logs: docker logs -f $CONTAINER_NAME"
echo "   - Stop: docker stop $CONTAINER_NAME"
echo "   - Restart: docker restart $CONTAINER_NAME"
echo ""
echo "⚡ Prochaines étapes:"
echo "   1. Configurez votre reverse proxy (Caddy)"
echo "   2. Ajoutez le service à votre docker-compose.yml"
echo "   3. Configurez l'OAuth Google avec la bonne URI de redirection"