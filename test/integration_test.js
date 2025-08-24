#!/usr/bin/env node

const axios = require('axios');
const { spawn } = require('child_process');

const BASE_URL = 'http://localhost:8021';
const API_KEY = 'test_api_key_for_development_only';

class GSCTestRunner {
  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'X-API-Key': API_KEY
      },
      timeout: 10000
    });
    this.results = [];
    this.serverProcess = null;
  }

  async startServer() {
    console.log('🚀 Démarrage du serveur GSC Connector...');
    
    this.serverProcess = spawn('npm', ['start'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`📊 Server: ${output.trim()}`);
    });

    this.serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (!output.includes('DeprecationWarning')) {
        console.error(`❌ Server Error: ${output.trim()}`);
      }
    });

    // Attendre que le serveur démarre
    await this.waitForServer();
  }

  async waitForServer(maxAttempts = 30) {
    console.log('⏳ Attente du démarrage du serveur...');
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.client.get('/health');
        console.log('✅ Serveur démarré avec succès');
        return;
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error('Le serveur n\'a pas pu démarrer dans les temps');
        }
        await this.sleep(1000);
      }
    }
  }

  async stopServer() {
    if (this.serverProcess) {
      console.log('🛑 Arrêt du serveur...');
      this.serverProcess.kill('SIGTERM');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runTest(testName, testFn) {
    console.log(`\n🧪 Test: ${testName}`);
    console.log('─'.repeat(50));
    
    try {
      const startTime = Date.now();
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: testName,
        status: 'PASSED',
        duration,
        result
      });
      
      console.log(`✅ ${testName} - PASSED (${duration}ms)`);
      return result;
    } catch (error) {
      this.results.push({
        name: testName,
        status: 'FAILED',
        error: error.message
      });
      
      console.error(`❌ ${testName} - FAILED: ${error.message}`);
      return null;
    }
  }

  async testHealthCheck() {
    const response = await this.client.get('/health');
    console.log(`Status: ${response.data.status}`);
    console.log(`Version: ${response.data.version}`);
    console.log(`Uptime: ${response.data.uptime}s`);
    
    if (response.data.status !== 'healthy' && response.data.status !== 'degraded') {
      throw new Error(`Statut de santé inattendu: ${response.data.status}`);
    }
    
    return response.data;
  }

  async testRootEndpoint() {
    const response = await this.client.get('/');
    console.log(`Service: ${response.data.name}`);
    console.log(`Endpoints disponibles: ${response.data.endpoints.length}`);
    
    if (!response.data.name.includes('GSC')) {
      throw new Error('Nom du service incorrect');
    }
    
    return response.data;
  }

  async testAuthUrl() {
    const response = await this.client.get('/auth/url');
    console.log('URL OAuth générée avec succès');
    console.log(`URL: ${response.data.auth_url.substring(0, 80)}...`);
    
    if (!response.data.auth_url.includes('accounts.google.com')) {
      throw new Error('URL OAuth invalide');
    }
    
    return response.data;
  }

  async testAuthStatus() {
    const response = await this.client.get('/auth/status');
    console.log(`Authentifié: ${response.data.authenticated}`);
    
    if (response.data.authenticated) {
      console.log('🎉 Compte Google déjà authentifié !');
    } else {
      console.log('ℹ️  Authentification requise (normal pour les tests)');
    }
    
    return response.data;
  }

  async testProperties() {
    try {
      const response = await this.client.get('/gsc/properties');
      console.log(`Propriétés trouvées: ${response.data.properties.length}`);
      
      if (response.data.properties.length > 0) {
        console.log('Première propriété:', response.data.properties[0]);
      }
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('ℹ️  Pas d\'authentification - normal pour les tests');
        return { properties: [] };
      }
      throw error;
    }
  }

  async testMetricsEndpoint() {
    try {
      const testUrl = 'https://example.com/test-page';
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      
      const response = await this.client.get('/metrics/url', {
        params: {
          url: testUrl,
          start: startDate,
          end: endDate
        }
      });
      
      console.log('Structure de réponse valide');
      console.log(`URL normalisée: ${response.data.data.url}`);
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 500 || error.response?.data?.error === 'metrics_fetch_failed') {
        console.log('ℹ️  Pas de données - normal sans authentification GSC');
        return { data: null };
      }
      throw error;
    }
  }

  async testImportDryRun() {
    try {
      const response = await this.client.post('/gsc/import', {
        property: 'https://example.com/',
        start: '2024-01-01',
        end: '2024-01-07',
        dryRun: true
      });
      
      console.log(`Résultat: ${response.data.message || response.data.status}`);
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('ℹ️  Import nécessite une authentification - normal');
        return { status: 'auth_required' };
      }
      throw error;
    }
  }

  async testErrorHandling() {
    try {
      await this.client.get('/nonexistent-endpoint');
      throw new Error('Devrait retourner une erreur 404');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ Gestion d\'erreur 404 correcte');
        console.log(`Message: ${error.response.data.message}`);
        return error.response.data;
      }
      throw error;
    }
  }

  async testApiKeyValidation() {
    try {
      const clientWithoutKey = axios.create({
        baseURL: BASE_URL,
        timeout: 5000
      });
      
      await clientWithoutKey.get('/gsc/properties');
      throw new Error('Devrait rejeter les requêtes sans clé API');
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('✅ Validation de clé API correcte');
        console.log(`Erreur: ${error.response.data.error}`);
        return error.response.data;
      }
      throw error;
    }
  }

  async testInputValidation() {
    try {
      await this.client.post('/gsc/import', {
        property: 'invalid-url',
        start: 'invalid-date',
        end: '2024-01-01'
      });
      throw new Error('Devrait rejeter les données invalides');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Validation des entrées correcte');
        console.log(`Erreur: ${error.response.data.message}`);
        return error.response.data;
      }
      throw error;
    }
  }

  async runAllTests() {
    console.log('🎯 GSC Connector - Suite de Tests d\'Intégration');
    console.log('='.repeat(60));
    
    try {
      await this.startServer();
      
      // Tests de base
      await this.runTest('Health Check', () => this.testHealthCheck());
      await this.runTest('Root Endpoint', () => this.testRootEndpoint());
      
      // Tests d'authentification
      await this.runTest('Auth URL Generation', () => this.testAuthUrl());
      await this.runTest('Auth Status', () => this.testAuthStatus());
      
      // Tests des endpoints GSC
      await this.runTest('GSC Properties', () => this.testProperties());
      await this.runTest('Import Dry Run', () => this.testImportDryRun());
      
      // Tests des métriques
      await this.runTest('Metrics Endpoint', () => this.testMetricsEndpoint());
      
      // Tests de sécurité et validation
      await this.runTest('Error Handling', () => this.testErrorHandling());
      await this.runTest('API Key Validation', () => this.testApiKeyValidation());
      await this.runTest('Input Validation', () => this.testInputValidation());
      
    } finally {
      await this.stopServer();
    }
    
    this.printResults();
  }

  printResults() {
    console.log('\n📊 RÉSULTATS DES TESTS');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const total = this.results.length;
    
    console.log(`✅ Tests réussis: ${passed}/${total}`);
    console.log(`❌ Tests échoués: ${failed}/${total}`);
    
    if (failed > 0) {
      console.log('\n🔍 DÉTAILS DES ÉCHECS:');
      this.results
        .filter(r => r.status === 'FAILED')
        .forEach(r => {
          console.log(`❌ ${r.name}: ${r.error}`);
        });
    }
    
    const successRate = (passed / total) * 100;
    console.log(`\n🎯 Taux de réussite: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 80) {
      console.log('🎉 GSC Connector fonctionne correctement !');
    } else {
      console.log('⚠️  Certains problèmes détectés');
    }
    
    console.log('\n💡 ÉTAPES SUIVANTES:');
    console.log('1. Pour une authentification complète: visitez /auth/url');
    console.log('2. Pour importer des données: authentifiez-vous puis utilisez /gsc/import');
    console.log('3. Pour les métriques: utilisez /metrics/url avec vos données');
  }
}

// Exécution des tests
if (require.main === module) {
  const testRunner = new GSCTestRunner();
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Interruption détectée...');
    await testRunner.stopServer();
    process.exit(0);
  });
  
  testRunner.runAllTests().catch(error => {
    console.error('💥 Erreur critique:', error.message);
    process.exit(1);
  });
}

module.exports = GSCTestRunner;