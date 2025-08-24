import requests
import json
from datetime import datetime, date
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin

class GSCConnectorClient:
    def __init__(self, base_url: str = "http://localhost:8021", api_key: str = None):
        """
        Client pour le microservice GSC Connector
        
        Args:
            base_url: URL de base du microservice (ex: http://localhost:8021)
            api_key: Clé API pour l'authentification
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        
        if api_key:
            self.session.headers.update({'X-API-Key': api_key})

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Effectue une requête HTTP avec gestion d'erreur"""
        url = urljoin(self.base_url + '/', endpoint.lstrip('/'))
        
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if hasattr(e.response, 'json'):
                try:
                    error_data = e.response.json()
                    raise GSCConnectorError(
                        error_data.get('message', str(e)),
                        error_data.get('error', 'unknown_error'),
                        e.response.status_code
                    )
                except ValueError:
                    pass
            raise GSCConnectorError(f"Erreur de requête: {str(e)}")

    # Méthodes d'authentification
    def get_auth_url(self) -> str:
        """Récupère l'URL d'authentification OAuth"""
        response = self._make_request('GET', '/auth/url')
        return response['auth_url']

    def get_auth_status(self) -> Dict:
        """Vérifie le statut d'authentification"""
        return self._make_request('GET', '/auth/status')

    # Méthodes GSC
    def get_properties(self) -> List[Dict]:
        """Récupère la liste des propriétés GSC disponibles"""
        response = self._make_request('GET', '/gsc/properties')
        return response['properties']

    def check_access(self, property_url: str) -> Dict:
        """Vérifie l'accès à une propriété GSC"""
        params = {'property': property_url}
        return self._make_request('GET', '/gsc/check-access', params=params)

    def import_data(self, 
                   property_url: str,
                   start_date: str,
                   end_date: str,
                   dimensions: Optional[List[str]] = None,
                   search_type: str = 'web',
                   data_state: str = 'all',
                   filters: Optional[Dict] = None,
                   dry_run: bool = False) -> Dict:
        """
        Import des données GSC
        
        Args:
            property_url: URL de la propriété GSC
            start_date: Date de début (YYYY-MM-DD)
            end_date: Date de fin (YYYY-MM-DD)
            dimensions: Dimensions à importer (défaut: ['page', 'query', 'country', 'device'])
            search_type: Type de recherche ('web', 'image', 'video')
            data_state: État des données ('all', 'final')
            filters: Filtres optionnels
            dry_run: Mode simulation
        """
        data = {
            'property': property_url,
            'start': start_date,
            'end': end_date,
            'searchType': search_type,
            'dataState': data_state,
            'dryRun': dry_run
        }
        
        if dimensions:
            data['dimensions'] = dimensions
        if filters:
            data['filters'] = filters

        return self._make_request('POST', '/gsc/import', json=data)

    # Méthodes de métriques
    def get_url_metrics(self,
                       url: str,
                       start_date: str,
                       end_date: str,
                       site_url: Optional[str] = None,
                       country: Optional[str] = None,
                       device: Optional[str] = None) -> Dict:
        """
        Récupère les métriques pour une URL
        
        Args:
            url: URL à analyser
            start_date: Date de début (YYYY-MM-DD)
            end_date: Date de fin (YYYY-MM-DD)
            site_url: URL du site (optionnel, déduit automatiquement)
            country: Code pays (optionnel)
            device: Type d'appareil (optionnel)
        """
        params = {
            'url': url,
            'start': start_date,
            'end': end_date
        }
        
        if site_url:
            params['siteUrl'] = site_url
        if country:
            params['country'] = country
        if device:
            params['device'] = device

        return self._make_request('GET', '/metrics/url', params=params)

    def get_url_list(self,
                    site_url: str,
                    start_date: str,
                    end_date: str,
                    limit: int = 100,
                    offset: int = 0,
                    order_by: str = 'clicks',
                    order: str = 'desc') -> Dict:
        """
        Récupère la liste des URLs avec métriques
        
        Args:
            site_url: URL du site
            start_date: Date de début
            end_date: Date de fin
            limit: Nombre de résultats (max 1000)
            offset: Décalage pour pagination
            order_by: Tri par ('clicks', 'impressions', 'ctr', 'position')
            order: Ordre ('asc', 'desc')
        """
        params = {
            'siteUrl': site_url,
            'start': start_date,
            'end': end_date,
            'limit': limit,
            'offset': offset,
            'orderBy': order_by,
            'order': order
        }

        return self._make_request('GET', '/metrics/urls', params=params)

    # Méthodes de santé
    def health_check(self) -> Dict:
        """Vérifie la santé du service"""
        return self._make_request('GET', '/health')

    def ready_check(self) -> Dict:
        """Vérifie si le service est prêt"""
        return self._make_request('GET', '/ready')

    def get_service_metrics(self) -> Dict:
        """Récupère les métriques du service"""
        return self._make_request('GET', '/metrics')

    # Méthodes utilitaires
    def format_date(self, date_obj) -> str:
        """Formate une date pour l'API"""
        if isinstance(date_obj, datetime):
            return date_obj.strftime('%Y-%m-%d')
        elif isinstance(date_obj, date):
            return date_obj.strftime('%Y-%m-%d')
        return str(date_obj)

class GSCConnectorError(Exception):
    """Exception personnalisée pour les erreurs du GSC Connector"""
    def __init__(self, message: str, error_code: str = None, status_code: int = None):
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code