from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import httpx
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import os

# Configuration du microservice GSC
GSC_BASE_URL = "http://localhost:8021"
GSC_API_KEY = "test_api_key_for_development_only"  # En production, utilisez une variable d'environnement

app = FastAPI(title="Mon API avec GSC Connector")

# Modèles Pydantic
class GSCImportRequest(BaseModel):
    site_url: str = Field(..., description="URL du site GSC (ex: https://example.com/)")
    start_date: str = Field(..., description="Date de début (YYYY-MM-DD)")
    end_date: str = Field(..., description="Date de fin (YYYY-MM-DD)")
    dry_run: bool = Field(default=False, description="Mode simulation")

class URLMetricsRequest(BaseModel):
    url: str = Field(..., description="URL à analyser")
    start_date: str = Field(..., description="Date de début (YYYY-MM-DD)")
    end_date: str = Field(..., description="Date de fin (YYYY-MM-DD)")
    country: Optional[str] = Field(None, description="Code pays (FR, US, etc.)")
    device: Optional[str] = Field(None, description="Type d'appareil (desktop, mobile, tablet)")

# Client HTTP réutilisable
class GSCConnectorClient:
    def __init__(self):
        self.base_url = GSC_BASE_URL
        self.headers = {"X-API-Key": GSC_API_KEY}
    
    async def _request(self, method: str, endpoint: str, **kwargs):
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.request(
                method, 
                f"{self.base_url}{endpoint}",
                headers=self.headers,
                **kwargs
            )
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"GSC Connector Error: {response.text}"
                )
            return response.json()
    
    async def get_properties(self):
        """Récupère la liste des propriétés GSC"""
        return await self._request("GET", "/gsc/properties")
    
    async def import_data(self, site_url: str, start_date: str, end_date: str, dry_run: bool = False):
        """Lance l'import des données GSC"""
        data = {
            "property": site_url,
            "start": start_date,
            "end": end_date,
            "dryRun": dry_run
        }
        return await self._request("POST", "/gsc/import", json=data)
    
    async def get_url_metrics(self, url: str, start_date: str, end_date: str, 
                            country: str = None, device: str = None):
        """Récupère les métriques d'une URL"""
        params = {
            "url": url,
            "start": start_date,
            "end": end_date
        }
        if country:
            params["country"] = country
        if device:
            params["device"] = device
            
        return await self._request("GET", "/metrics/url", params=params)
    
    async def get_url_list(self, site_url: str, start_date: str, end_date: str, 
                          limit: int = 100, order_by: str = "clicks"):
        """Récupère la liste des URLs avec métriques"""
        params = {
            "siteUrl": site_url,
            "start": start_date,
            "end": end_date,
            "limit": limit,
            "orderBy": order_by,
            "order": "desc"
        }
        return await self._request("GET", "/metrics/urls", params=params)
    
    async def check_health(self):
        """Vérifie la santé du service"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/")
                return response.status_code == 200
        except:
            return False

# Instance du client GSC
gsc_client = GSCConnectorClient()

# ROUTES FASTAPI

@app.get("/")
async def root():
    return {"message": "API FastAPI avec GSC Connector"}

@app.get("/gsc/status")
async def gsc_status():
    """Vérifie le statut du microservice GSC"""
    is_healthy = await gsc_client.check_health()
    return {"gsc_service_healthy": is_healthy}

@app.get("/gsc/properties")
async def get_gsc_properties():
    """Liste les propriétés GSC disponibles"""
    try:
        result = await gsc_client.get_properties()
        return result
    except HTTPException as e:
        if "401" in str(e.detail) or "oauth" in str(e.detail).lower():
            raise HTTPException(
                status_code=401, 
                detail="GSC non authentifié. Visitez http://localhost:8021/auth/url pour vous authentifier"
            )
        raise e

@app.post("/gsc/import")
async def import_gsc_data(request: GSCImportRequest, background_tasks: BackgroundTasks):
    """Lance l'import des données GSC (peut être long)"""
    try:
        if not request.dry_run:
            # Pour les vrais imports, on lance en arrière-plan
            background_tasks.add_task(
                _background_import,
                request.site_url,
                request.start_date, 
                request.end_date
            )
            return {"message": "Import lancé en arrière-plan", "dry_run": False}
        else:
            # Pour les dry runs, on attend le résultat
            result = await gsc_client.import_data(
                request.site_url,
                request.start_date,
                request.end_date,
                dry_run=True
            )
            return result
    except HTTPException as e:
        raise e

async def _background_import(site_url: str, start_date: str, end_date: str):
    """Tâche d'import en arrière-plan"""
    try:
        result = await gsc_client.import_data(site_url, start_date, end_date, dry_run=False)
        print(f"✅ Import terminé: {result}")
    except Exception as e:
        print(f"❌ Erreur d'import: {e}")

@app.post("/gsc/metrics/url")
async def get_url_metrics(request: URLMetricsRequest):
    """Récupère les métriques d'une URL spécifique"""
    try:
        result = await gsc_client.get_url_metrics(
            request.url,
            request.start_date,
            request.end_date,
            request.country,
            request.device
        )
        return result
    except HTTPException as e:
        raise e

@app.get("/gsc/export/top-pages/{site_url}")
async def export_top_pages(
    site_url: str,
    days: int = 30,
    limit: int = 100,
    format: str = "json"
):
    """Exporte les top pages d'un site (format JSON ou CSV)"""
    try:
        # Calculer les dates
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Récupérer les données
        result = await gsc_client.get_url_list(
            f"https://{site_url}/",
            start_date.isoformat(),
            end_date.isoformat(),
            limit=limit
        )
        
        if format == "csv":
            # Convertir en CSV
            import csv
            from io import StringIO
            
            output = StringIO()
            writer = csv.DictWriter(output, fieldnames=['url', 'clicks', 'impressions', 'ctr', 'avg_position'])
            writer.writeheader()
            
            for url_data in result['data']['urls']:
                writer.writerow(url_data)
            
            return {"csv_data": output.getvalue()}
        
        return result
        
    except HTTPException as e:
        raise e

@app.get("/gsc/dashboard/{site_url}")
async def get_dashboard_data(site_url: str, days: int = 30):
    """Données complètes pour un dashboard"""
    try:
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Récupérer les top URLs
        urls_data = await gsc_client.get_url_list(
            f"https://{site_url}/",
            start_date.isoformat(),
            end_date.isoformat(),
            limit=50
        )
        
        # Calculer les totaux
        total_clicks = sum(url['clicks'] for url in urls_data['data']['urls'])
        total_impressions = sum(url['impressions'] for url in urls_data['data']['urls'])
        avg_ctr = total_clicks / total_impressions if total_impressions > 0 else 0
        
        return {
            "site_url": site_url,
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": days
            },
            "totals": {
                "clicks": total_clicks,
                "impressions": total_impressions,
                "ctr": round(avg_ctr, 4),
                "pages_analyzed": len(urls_data['data']['urls'])
            },
            "top_pages": urls_data['data']['urls'][:10],  # Top 10
            "all_pages": urls_data['data']['urls']
        }
        
    except HTTPException as e:
        raise e

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)