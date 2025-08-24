# Déploiement GSC Connector sur VPS

## 📋 Pré-requis

- Docker installé sur le VPS
- Caddy comme reverse proxy
- Accès à `/seo-tools/` sur le VPS
- Domaine configuré: `ndd.fr`

## 🚀 Instructions de déploiement

### 1. Copier les fichiers sur le VPS

```bash
# Sur votre machine locale
scp -r gsc-connector/ user@vps:/seo-tools/

# Ou via git
cd /seo-tools/
git clone <repository-url> gsc-connector
cd gsc-connector
```

### 2. Configuration des variables d'environnement

Modifiez le fichier `.env.production` avec vos vraies valeurs :

```bash
cd /seo-tools/gsc-connector/
nano .env.production
```

**Variables à modifier obligatoirement :**
```bash
# Remplacez par vos vraies credentials OAuth Google
GOOGLE_CLIENT_ID=votre_client_id_google
GOOGLE_CLIENT_SECRET=votre_client_secret_google

# Remplacez par une clé sécurisée de 32 caractères
ENCRYPTION_KEY=votre_cle_de_chiffrement_32_caracteres

# Remplacez par une API key sécurisée
API_KEY=votre_api_key_securisee

# Configurez selon vos besoins de sécurité
ALLOWED_IPS=ip1,ip2,ip3

# Domaine de production
OAUTH_REDIRECT_URI=https://ndd.fr/gsc-connector/auth/callback
CORS_ORIGINS=https://ndd.fr
```

### 3. Configuration OAuth Google

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez ou sélectionnez un projet
3. Activez l'API Google Search Console
4. Créez des identifiants OAuth 2.0
5. Ajoutez l'URI de redirection: `https://ndd.fr/gsc-connector/auth/callback`

### 4. Construction de l'image Docker

```bash
cd /seo-tools/gsc-connector/
docker build -t gsc-connector:latest .
```

### 5. Configuration Caddy

Ajoutez cette section à votre `Caddyfile` :

```caddy
ndd.fr {
    # Autres configurations...
    
    # GSC Connector
    handle_path /gsc-connector/* {
        reverse_proxy gsc-connector:3000
    }
}
```

### 6. Ajout au docker-compose.yml

Dans `/seo-tools/docker-compose.yml`, ajoutez le service :

```yaml
services:
  gsc-connector:
    image: gsc-connector:latest
    container_name: gsc-connector
    restart: unless-stopped
    ports:
      - "8021:8021"
    environment:
      - NODE_ENV=production
      - BASE_PATH=/gsc-connector
      - PORT=8021
    networks:
      - seo-tools-network
    # Mode stateless - plus besoin de PostgreSQL/Redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8021/gsc-connector/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  # Vos autres services...
```

### 7. Démarrage

```bash
cd /seo-tools/
docker-compose up -d gsc-connector
```

### 8. Vérification

```bash
# Vérifier les logs
docker logs gsc-connector

# Tester l'endpoint de santé
curl https://ndd.fr/gsc-connector/health

# Tester l'endpoint principal
curl https://ndd.fr/gsc-connector/
```

## 🔧 Configuration de base de données (optionnel)

Si vous souhaitez utiliser PostgreSQL pour persister les données :

### Dans docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: gsc_connector
      POSTGRES_USER: gsc_user
      POSTGRES_PASSWORD: secure_password_here
    volumes:
      - gsc_postgres_data:/var/lib/postgresql/data
    networks:
      - seo-tools-network

volumes:
  gsc_postgres_data:
```

### Mise à jour de .env.production

```bash
DB_HOST=postgres
DB_PORT=5432
DB_NAME=gsc_connector
DB_USER=gsc_user
DB_PASSWORD=secure_password_here
SKIP_DB_SAVE=false
SKIP_DB_INIT=false
```

## 🔐 Authentification

1. Accédez à `https://ndd.fr/gsc-connector/auth/url`
2. Copiez l'URL générée et ouvrez-la dans un navigateur
3. Autorisez l'accès à Google Search Console
4. Vérifiez l'authentification : `https://ndd.fr/gsc-connector/auth/status`

## 📊 Utilisation

Une fois déployé, utilisez les endpoints comme dans la documentation :

```python
# Dans vos outils FastAPI
BASE_URL = "https://ndd.fr/gsc-connector"
API_KEY = "votre_api_key_securisee"

async def get_gsc_properties():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/gsc/properties",
            headers={"X-API-Key": API_KEY}
        )
        return response.json()
```

## 🔍 Monitoring et logs

```bash
# Voir les logs en temps réel
docker logs -f gsc-connector

# Vérifier l'état du conteneur
docker ps | grep gsc-connector

# Redémarrer si nécessaire
docker-compose restart gsc-connector
```

## 🛠 Maintenance

### Mise à jour

```bash
# Reconstruire l'image
cd /seo-tools/gsc-connector/
docker build -t gsc-connector:latest .

# Redémarrer le service
cd /seo-tools/
docker-compose up -d gsc-connector
```

### Sauvegarde

```bash
# Sauvegarder la base de données (si utilisée)
docker exec postgres pg_dump -U gsc_user gsc_connector > backup.sql
```

## 🚨 Dépannage

### Problèmes courants

1. **Conteneur qui ne démarre pas**
   ```bash
   docker logs gsc-connector
   # Vérifiez les variables d'environnement
   ```

2. **OAuth ne fonctionne pas**
   - Vérifiez l'URI de redirection dans Google Cloud Console
   - Confirmez que `OAUTH_REDIRECT_URI` est correct

3. **Endpoints inaccessibles**
   - Vérifiez la configuration Caddy
   - Testez le health check : `curl http://localhost:3000/gsc-connector/health`

4. **Problèmes de permissions**
   - Vérifiez les `ALLOWED_IPS`
   - Confirmez l'API key

---

**🎯 Service prêt !** Votre GSC Connector est maintenant accessible sur `https://ndd.fr/gsc-connector/`