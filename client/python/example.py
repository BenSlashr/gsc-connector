#!/usr/bin/env python3
"""
Exemple d'utilisation du client Python pour GSC Connector
"""

from gsc_client import GSCConnectorClient, GSCConnectorError
from datetime import datetime, timedelta
import pandas as pd
import os

def main():
    # Configuration
    BASE_URL = "http://localhost:8021"
    API_KEY = os.getenv("GSC_API_KEY")  # Votre clé API
    
    # Initialiser le client
    client = GSCConnectorClient(base_url=BASE_URL, api_key=API_KEY)
    
    try:
        # 1. Vérifier la santé du service
        print("🔍 Vérification de la santé du service...")
        health = client.health_check()
        print(f"Status: {health['status']}")
        
        # 2. Vérifier l'authentification
        print("\n🔐 Vérification de l'authentification...")
        auth_status = client.get_auth_status()
        
        if not auth_status.get('authenticated'):
            print("❌ Non authentifié. Obtenez l'URL d'auth:")
            auth_url = client.get_auth_url()
            print(f"URL d'authentification: {auth_url}")
            return
        
        print("✅ Authentifié avec succès")
        
        # 3. Récupérer les propriétés
        print("\n📊 Récupération des propriétés GSC...")
        properties = client.get_properties()
        
        if not properties:
            print("❌ Aucune propriété trouvée")
            return
            
        print(f"Propriétés trouvées: {len(properties)}")
        for prop in properties:
            print(f"  - {prop['display_name']} ({prop['site_url']})")
        
        # Utiliser la première propriété
        property_url = properties[0]['site_url']
        print(f"\n🎯 Utilisation de la propriété: {property_url}")
        
        # 4. Import de données (mode dry run)
        print("\n📥 Test d'import de données (dry run)...")
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=7)
        
        import_result = client.import_data(
            property_url=property_url,
            start_date=client.format_date(start_date),
            end_date=client.format_date(end_date),
            dry_run=True
        )
        
        print(f"Résultat: {import_result['message']}")
        
        # 5. Récupération des métriques pour une URL
        print("\n📈 Récupération des métriques...")
        
        # D'abord, récupérer la liste des URLs
        urls_data = client.get_url_list(
            site_url=property_url,
            start_date=client.format_date(start_date),
            end_date=client.format_date(end_date),
            limit=10
        )
        
        if urls_data['data']['urls']:
            top_url = urls_data['data']['urls'][0]['url']
            print(f"URL analysée: {top_url}")
            
            # Récupérer les métriques détaillées
            metrics = client.get_url_metrics(
                url=top_url,
                start_date=client.format_date(start_date),
                end_date=client.format_date(end_date)
            )
            
            data = metrics['data']
            print(f"Totaux sur la période:")
            print(f"  - Clics: {data['totals']['clicks']}")
            print(f"  - Impressions: {data['totals']['impressions']}")
            print(f"  - CTR: {data['totals']['ctr']:.2%}")
            print(f"  - Position moyenne: {data['totals']['avg_position']:.1f}")
            
            # Convertir en DataFrame pandas
            df = pd.DataFrame(data['timeseries'])
            if not df.empty:
                print(f"\nDonnées disponibles sur {len(df)} jours")
                print(df.head())
                
                # Sauvegarder en CSV
                df.to_csv('gsc_metrics.csv', index=False)
                print("💾 Données sauvegardées dans gsc_metrics.csv")
        
        else:
            print("❌ Aucune donnée disponible pour cette période")
        
        # 6. Métriques du service
        print("\n🔧 Métriques du service...")
        service_metrics = client.get_service_metrics()
        print(f"Propriétés: {service_metrics['metrics']['properties']['count']}")
        
    except GSCConnectorError as e:
        print(f"❌ Erreur GSC Connector: {e}")
        if e.error_code:
            print(f"Code d'erreur: {e.error_code}")
    except Exception as e:
        print(f"❌ Erreur inattendue: {e}")

def example_data_analysis():
    """Exemple d'analyse de données avec pandas"""
    print("\n📊 Exemple d'analyse de données")
    
    client = GSCConnectorClient(api_key=os.getenv("GSC_API_KEY"))
    
    # Récupérer plusieurs URLs
    properties = client.get_properties()
    if not properties:
        return
        
    property_url = properties[0]['site_url']
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=30)
    
    # Récupérer le top 50 des URLs
    urls_data = client.get_url_list(
        site_url=property_url,
        start_date=client.format_date(start_date),
        end_date=client.format_date(end_date),
        limit=50,
        order_by='clicks'
    )
    
    # Convertir en DataFrame
    df = pd.DataFrame(urls_data['data']['urls'])
    
    if not df.empty:
        print(f"Top 10 URLs par clics:")
        print(df[['url', 'clicks', 'impressions', 'ctr']].head(10))
        
        # Calculs
        total_clicks = df['clicks'].sum()
        avg_ctr = df['ctr'].mean()
        
        print(f"\nRésumé:")
        print(f"Total clics (top 50): {total_clicks:,}")
        print(f"CTR moyen: {avg_ctr:.2%}")

if __name__ == "__main__":
    print("🚀 GSC Connector - Client Python")
    print("=================================")
    
    main()
    
    # Décommenter pour l'exemple d'analyse
    # example_data_analysis()