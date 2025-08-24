#!/bin/bash

BASE_URL="http://localhost:8021"
API_KEY="test_api_key_for_development_only"

echo "🧪 GSC Connector - Tests CURL"
echo "=============================="

# Fonction pour tester un endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo ""
    echo "🔍 Test: $description"
    echo "Endpoint: $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -H "X-API-Key: $API_KEY" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" -d "$data" "$BASE_URL$endpoint")
    fi
    
    # Séparer le body et le status code
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    echo "Status: $http_code"
    echo "Response: $(echo "$body" | jq . 2>/dev/null || echo "$body")"
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        echo "✅ SUCCESS"
    else
        echo "❌ FAILED"
    fi
    
    echo "---"
}

# Attendre que le serveur démarre (si nécessaire)
echo "⏳ Vérification de la disponibilité du serveur..."
for i in {1..10}; do
    if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        echo "✅ Serveur disponible"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ Serveur non disponible. Assurez-vous qu'il est démarré sur le port 8021."
        exit 1
    fi
    sleep 2
done

# Tests des endpoints
test_endpoint "GET" "/" "" "Page d'accueil"
test_endpoint "GET" "/health" "" "Health Check"
test_endpoint "GET" "/ready" "" "Readiness Check"
test_endpoint "GET" "/auth/url" "" "Génération URL OAuth"
test_endpoint "GET" "/auth/status" "" "Statut d'authentification"
test_endpoint "GET" "/gsc/properties" "" "Liste des propriétés GSC"

# Test avec paramètres
test_endpoint "GET" "/metrics/url?url=https://example.com/test&start=2024-01-01&end=2024-01-31" "" "Métriques d'URL"

# Test POST avec données
test_endpoint "POST" "/gsc/import" '{"property":"https://example.com/","start":"2024-01-01","end":"2024-01-07","dryRun":true}' "Import dry run"

# Test de validation d'entrée
test_endpoint "POST" "/gsc/import" '{"property":"invalid-url"}' "Validation d'entrée (doit échouer)"

# Test sans clé API
echo ""
echo "🔍 Test: Accès sans clé API (doit échouer)"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/gsc/properties")
http_code=$(echo "$response" | tail -n1)
echo "Status: $http_code"
if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    echo "✅ SUCCESS - Accès correctement refusé"
else
    echo "❌ FAILED - Devrait refuser l'accès"
fi
echo "---"

# Test endpoint inexistant
test_endpoint "GET" "/nonexistent" "" "Endpoint inexistant (doit retourner 404)"

echo ""
echo "✅ Tests CURL terminés"
echo ""
echo "💡 Pour une authentification complète:"
echo "   1. Visitez: $BASE_URL/auth/url"
echo "   2. Complétez l'OAuth Google"
echo "   3. Relancez les tests pour voir les données réelles"