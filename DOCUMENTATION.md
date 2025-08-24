# GSC Connector - Documentation d'utilisation

Un microservice Node.js pour connecter et extraire les données de Google Search Console via API.

## 🎯 Cas d'usage simples depuis FastAPI

Vous avez un outil Python FastAPI et vous voulez récupérer des données GSC ? Voici les 5 cas les plus courants :

### 1. 📊 **Lister les sites disponibles**
```python
# Dans votre FastAPI
import httpx

@app.get("/mes-sites-gsc")
async def get_my_sites():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://ndd.fr/gsc-connector/gsc/properties",
            headers={"X-API-Key": "your_api_key_here"}
        )
        data = response.json()
        return {"sites": [site["display_name"] for site in data["properties"]]}

# Résultat: {"sites": ["agence-slashr.fr", "exemple.com", "..."]}
```

### 2. 🔥 **Top pages d'un site (1 mois)**
```python
@app.get("/top-pages/{site}")
async def get_top_pages(site: str):
    # 1. Importer les données du mois
    import_data = {
        "property": f"sc-domain:{site}",
        "start": "2025-07-24",  # Il y a 1 mois
        "end": "2025-08-23",    # Aujourd'hui
        "dryRun": False
    }
    
    async with httpx.AsyncClient(timeout=60) as client:
        # Import des données
        await client.post(
            "https://ndd.fr/gsc-connector/gsc/import",
            headers={
                "X-API-Key": "your_api_key_here",
                "Content-Type": "application/json"
            },
            json=import_data
        )
        
        # Récupérer les top URLs
        response = await client.get(
            "https://ndd.fr/gsc-connector/metrics/urls",
            headers={"X-API-Key": "your_api_key_here"},
            params={
                "siteUrl": f"sc-domain:{site}",
                "start": "2025-07-24",
                "end": "2025-08-23", 
                "limit": 20,
                "orderBy": "clicks"
            }
        )
        
        return response.json()

# Usage: GET /top-pages/agence-slashr.fr
```

### 3. 🎯 **Métriques d'une page spécifique**
```python
@app.get("/page-metrics")
async def get_page_metrics(url: str, days: int = 30):
    from datetime import datetime, timedelta
    
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://ndd.fr/gsc-connector/metrics/url",
            headers={"X-API-Key": "your_api_key_here"},
            params={
                "url": url,
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            }
        )
        
        return response.json()

# Usage: GET /page-metrics?url=https://agence-slashr.fr/seo&days=30
```

### 4. 🚀 **Dashboard complet d'un site**
```python
@app.get("/dashboard/{site}")
async def site_dashboard(site: str):
    async with httpx.AsyncClient(timeout=120) as client:
        headers = {"X-API-Key": "your_api_key_here"}
        
        # 1. Importer les données récentes
        await client.post(
            "https://ndd.fr/gsc-connector/gsc/import",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "property": f"sc-domain:{site}",
                "start": "2025-08-20",
                "end": "2025-08-23",
                "dryRun": False
            }
        )
        
        # 2. Top pages
        top_pages = await client.get(
            "https://ndd.fr/gsc-connector/metrics/urls",
            headers=headers,
            params={
                "siteUrl": f"sc-domain:{site}",
                "start": "2025-08-20",
                "end": "2025-08-23",
                "limit": 10,
                "orderBy": "clicks"
            }
        )
        
        return {
            "site": site,
            "period": "3 derniers jours",
            "top_pages": top_pages.json()["data"]["urls"],
            "summary": f"Dashboard pour {site}"
        }

# Usage: GET /dashboard/agence-slashr.fr
```

### 5. 📈 **Comparaison avant/après (2 périodes)**
```python
@app.get("/compare/{site}")
async def compare_periods(site: str):
    async with httpx.AsyncClient(timeout=120) as client:
        headers = {"X-API-Key": "your_api_key_here"}
        
        # Période récente
        recent_data = await client.get(
            "https://ndd.fr/gsc-connector/metrics/urls",
            headers=headers,
            params={
                "siteUrl": f"sc-domain:{site}",
                "start": "2025-08-15",
                "end": "2025-08-23",
                "limit": 10
            }
        )
        
        # Période précédente 
        previous_data = await client.get(
            "https://ndd.fr/gsc-connector/metrics/urls", 
            headers=headers,
            params={
                "siteUrl": f"sc-domain:{site}",
                "start": "2025-08-01",
                "end": "2025-08-14",
                "limit": 10
            }
        )
        
        return {
            "site": site,
            "recent_period": recent_data.json(),
            "previous_period": previous_data.json(),
            "comparison": "Données comparatives disponibles"
        }

# Usage: GET /compare/agence-slashr.fr
```

### 💡 **Client réutilisable**
```python
# Créez cette classe une fois dans votre projet
class GSCClient:
    def __init__(self):
        self.base_url = "https://ndd.fr/gsc-connector"
        self.headers = {"X-API-Key": "your_api_key_here"}
    
    async def import_site_data(self, site, start_date, end_date):
        async with httpx.AsyncClient(timeout=60) as client:
            return await client.post(
                f"{self.base_url}/gsc/import",
                headers={**self.headers, "Content-Type": "application/json"},
                json={
                    "property": f"sc-domain:{site}",
                    "start": start_date,
                    "end": end_date,
                    "dryRun": False
                }
            )
    
    async def get_top_urls(self, site, start_date, end_date, limit=20):
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/metrics/urls",
                headers=self.headers,
                params={
                    "siteUrl": f"sc-domain:{site}",
                    "start": start_date,
                    "end": end_date,
                    "limit": limit,
                    "orderBy": "clicks"
                }
            )
            return response.json()

# Utilisation dans vos endpoints
gsc = GSCClient()

@app.get("/quick-report/{site}")
async def quick_report(site: str):
    # Import + analyse en 2 lignes
    await gsc.import_site_data(site, "2025-08-20", "2025-08-23")
    top_urls = await gsc.get_top_urls(site, "2025-08-20", "2025-08-23", limit=5)
    
    return {
        "site": site,
        "top_5_pages": top_urls["data"]["urls"][:5]
    }
```

---

## 🚀 Démarrage rapide

### 1. Lancement du service
```bash
npm start
# Service disponible sur http://localhost:8021
```

### 2. Authentification Google
```bash
# Obtenir l'URL d'authentification
curl -H "X-API-Key: test_api_key_for_development_only" \
  http://localhost:8021/auth/url

# Réponse:
{
  "success": true,
  "auth_url": "https://accounts.google.com/o/oauth2/..."
}
```

Ouvrir l'URL dans un navigateur et autoriser l'accès à Google Search Console.

### 3. Vérifier l'authentification
```bash
curl -H "X-API-Key: test_api_key_for_development_only" \
  http://localhost:8021/auth/status

# Réponse si authentifié:
{
  "success": true,
  "authenticated": true,
  "email": "hello@slashr.fr"
}
```

## 📋 API Endpoints

### Authentification

#### `GET /auth/url`
Génère l'URL d'authentification Google OAuth.

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:8021/auth/url
```

#### `GET /auth/status`
Vérifie le statut d'authentification.

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:8021/auth/status
```

### Propriétés GSC

#### `GET /gsc/properties`
Liste toutes les propriétés Google Search Console accessibles.

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:8021/gsc/properties
```

**Réponse:**
```json
{
  "success": true,
  "properties": [
    {
      "site_url": "sc-domain:agence-slashr.fr",
      "type": "DOMAIN_PROPERTY", 
      "display_name": "agence-slashr.fr"
    },
    {
      "site_url": "https://example.com/",
      "type": "URL_PREFIX",
      "display_name": "https://example.com/"
    }
  ]
}
```

### Import de données

#### `POST /gsc/import`
Importe les données Search Analytics d'une propriété.

**Paramètres:**
```json
{
  "property": "sc-domain:agence-slashr.fr",
  "start": "2025-07-01",
  "end": "2025-07-31", 
  "dryRun": true
}
```

**Exemple - Test dry run:**
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "property": "sc-domain:agence-slashr.fr",
    "start": "2025-07-01", 
    "end": "2025-07-31",
    "dryRun": true
  }' \
  http://localhost:8021/gsc/import
```

**Exemple - Import réel:**
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "property": "sc-domain:agence-slashr.fr",
    "start": "2025-08-01",
    "end": "2025-08-01", 
    "dryRun": false
  }' \
  http://localhost:8021/gsc/import
```

### Métriques

#### `GET /metrics/url`
Récupère les métriques d'une URL spécifique.

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "http://localhost:8021/metrics/url?url=https://agence-slashr.fr/seo&start=2025-07-01&end=2025-07-31"
```

#### `GET /metrics/urls`  
Liste les URLs avec leurs métriques.

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "http://localhost:8021/metrics/urls?siteUrl=sc-domain:agence-slashr.fr&start=2025-07-01&end=2025-07-31&limit=50"
```

## 🐍 Intégration Python/FastAPI

### Installation des dépendances
```bash
pip install fastapi httpx uvicorn
```

### Client Python
```python
import httpx
from datetime import datetime, timedelta

class GSCConnectorClient:
    def __init__(self, base_url="http://localhost:8021", api_key="YOUR_API_KEY"):
        self.base_url = base_url
        self.headers = {"X-API-Key": api_key}
    
    async def get_properties(self):
        """Récupère la liste des propriétés GSC"""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/gsc/properties", headers=self.headers)
            return response.json()
    
    async def import_data(self, site_url, start_date, end_date, dry_run=False):
        """Lance l'import des données GSC"""
        data = {
            "property": site_url,
            "start": start_date,
            "end": end_date, 
            "dryRun": dry_run
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/gsc/import",
                headers={**self.headers, "Content-Type": "application/json"},
                json=data
            )
            return response.json()
    
    async def get_top_pages(self, site_url, days=30, limit=50):
        """Récupère les top pages d'un site"""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        params = {
            "siteUrl": site_url,
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "limit": limit,
            "orderBy": "clicks",
            "order": "desc"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/metrics/urls",
                headers=self.headers,
                params=params
            )
            return response.json()

# Utilisation
async def main():
    client = GSCConnectorClient()
    
    # Lister les propriétés
    properties = await client.get_properties()
    print(f"Propriétés trouvées: {len(properties['properties'])}")
    
    # Import données pour agence-slashr.fr
    result = await client.import_data(
        "sc-domain:agence-slashr.fr",
        "2025-08-01",
        "2025-08-01",
        dry_run=True
    )
    print(f"Import test: {result}")
    
    # Top pages
    top_pages = await client.get_top_pages("sc-domain:agence-slashr.fr", days=30)
    print(f"Top pages: {top_pages}")
```

### Intégration FastAPI
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()
gsc_client = GSCConnectorClient()

class ImportRequest(BaseModel):
    site_url: str
    start_date: str
    end_date: str
    dry_run: bool = False

@app.get("/sites")
async def get_sites():
    """Liste les sites GSC disponibles"""
    try:
        result = await gsc_client.get_properties()
        return {"sites": result["properties"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/import")
async def import_gsc_data(request: ImportRequest):
    """Importe les données GSC"""
    try:
        result = await gsc_client.import_data(
            request.site_url,
            request.start_date,
            request.end_date,
            request.dry_run
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/dashboard/{site_url}")
async def get_dashboard(site_url: str, days: int = 30):
    """Données de dashboard pour un site"""
    try:
        top_pages = await gsc_client.get_top_pages(f"sc-domain:{site_url}", days)
        return {
            "site": site_url,
            "period_days": days,
            "top_pages": top_pages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Lancer avec: uvicorn main:app --reload
```

## 📊 Cas d'usage pratiques

### 1. Audit SEO mensuel
```bash
# 1. Récupérer les données du mois dernier
curl -X POST \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "property": "sc-domain:agence-slashr.fr",
    "start": "2025-07-01",
    "end": "2025-07-31",
    "dryRun": false
  }' \
  http://localhost:8021/gsc/import

# 2. Analyser les top URLs
curl "http://localhost:8021/metrics/urls?siteUrl=sc-domain:agence-slashr.fr&start=2025-07-01&end=2025-07-31&limit=100&orderBy=clicks"
```

### 2. Suivi de performance d'une page
```bash
# Métriques d'une page spécifique
curl "http://localhost:8021/metrics/url?url=https://agence-slashr.fr/services/seo&start=2025-07-01&end=2025-07-31"
```

### 3. Comparaison mensuelle
```python
async def compare_months(site_url):
    client = GSCConnectorClient()
    
    # Mois actuel
    current_month = await client.get_top_pages(site_url, days=30)
    
    # Mois précédent (nécessite import des données historiques)
    previous_month = await client.get_top_pages(site_url, days=60)
    
    return {
        "current": current_month,
        "previous": previous_month
    }
```

### 4. Analyse de mots-clés
```bash
# Importer avec dimension query pour les mots-clés
curl -X POST \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "property": "sc-domain:agence-slashr.fr", 
    "start": "2025-08-01",
    "end": "2025-08-01",
    "dimensions": ["query", "page", "country", "device"]
  }' \
  http://localhost:8021/gsc/import
```

### 5. Dashboard automatisé
```python
from fastapi import FastAPI
import asyncio
from datetime import datetime, timedelta

app = FastAPI()

@app.get("/auto-dashboard/{site}")
async def auto_dashboard(site: str):
    client = GSCConnectorClient()
    
    # Import automatique des 7 derniers jours
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=7)
    
    # Import en arrière-plan
    asyncio.create_task(client.import_data(
        f"sc-domain:{site}",
        start_date.isoformat(),
        end_date.isoformat()
    ))
    
    # Retourner les données existantes
    top_pages = await client.get_top_pages(f"sc-domain:{site}", days=7)
    
    return {
        "site": site,
        "period": f"{start_date} to {end_date}",
        "top_pages": top_pages["data"]["urls"][:10],
        "total_pages": len(top_pages["data"]["urls"])
    }
```

## 🔧 Configuration

### Variables d'environnement
```bash
# Serveur
PORT=8021
NODE_ENV=development

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret  
OAUTH_REDIRECT_URI=http://localhost:8021/auth/callback

# Sécurité
API_KEY=your_secure_api_key
ALLOWED_IPS=127.0.0.1,::1

# Base de données (optionnel pour tests)
SKIP_DB_SAVE=true
SKIP_DB_INIT=true

# Cache
CACHE_TTL=86400
METRICS_CACHE_TTL=172800
```

### Headers requis
```
X-API-Key: your_api_key_here
Content-Type: application/json (pour POST)
```

## ❗ Gestion d'erreurs

### Erreurs d'authentification
```json
{
  "success": false,
  "error": "unauthorized",
  "message": "No valid authentication found. Please authenticate via /auth/url"
}
```

### Erreurs de propriété
```json
{
  "success": false,
  "error": "insufficient_permissions", 
  "message": "Account does not have access to this property"
}
```

### Erreurs de quota
```json
{
  "success": false,
  "error": "rate_limited",
  "message": "Too many requests, please try again later"
}
```

## 📈 Performance

- **Quota GSC**: 200 requêtes/jour max par défaut
- **Limite de lignes**: 25 000 lignes par requête
- **Retry automatique**: 3 tentatives avec backoff exponentiel
- **Cache**: TTL configurable pour éviter les requêtes répétées

## 🔒 Sécurité

- Authentication OAuth 2.0 Google
- API Key obligatoire pour tous les endpoints
- Whitelist d'IPs configurables
- Tokens chiffrés en base (AES-256-GCM)
- HTTPS requis en production

---

**🎯 Prêt à utiliser !** Ce microservice est opérationnel pour extraire et analyser vos données Google Search Console via API.