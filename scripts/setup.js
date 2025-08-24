#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('base64');
}

function setupEnvironment() {
  const envPath = path.join(__dirname, '../.env');
  
  if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists. Please manually update if needed.');
    return;
  }

  const encryptionKey = generateEncryptionKey();
  const apiKey = generateApiKey();

  const envContent = `# Server Configuration
PORT=8021
NODE_ENV=development

# Google OAuth Configuration (UPDATE THESE)
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
OAUTH_REDIRECT_URI=http://localhost:8021/auth/callback

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gsc_connector
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Security (GENERATED - DO NOT CHANGE)
ENCRYPTION_KEY=${encryptionKey}
API_KEY=${apiKey}
ALLOWED_IPS=127.0.0.1,::1

# Cache Settings
CACHE_TTL=86400
METRICS_CACHE_TTL=172800

# Import Settings
GSC_BATCH_SIZE=25000
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000
`;

  fs.writeFileSync(envPath, envContent);
  
  console.log('✅ .env file created successfully!');
  console.log('📝 Please update the Google OAuth credentials in .env');
  console.log('🔑 Generated secure encryption key and API key');
  console.log(`🔐 Your API key: ${apiKey}`);
  console.log('💾 Save this API key - you\'ll need it to access the service');
}

function displayNextSteps() {
  console.log('\n📋 Next Steps:');
  console.log('1. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
  console.log('2. Create PostgreSQL database: createdb gsc_connector');
  console.log('3. (Optional) Start Redis server');
  console.log('4. Run: npm start');
  console.log('5. Visit: http://localhost:8021/auth/url to authenticate');
  console.log('\n🔗 Useful endpoints:');
  console.log('   Health: http://localhost:8021/health');
  console.log('   Properties: http://localhost:8021/gsc/properties');
  console.log('   Metrics: http://localhost:8021/metrics/url?url=...');
}

console.log('🚀 GSC Connector Setup');
console.log('======================\n');

setupEnvironment();
displayNextSteps();