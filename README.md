# GSC Connector

A microservice for importing and serving Google Search Console data with OAuth authentication, data normalization, caching, and comprehensive error handling.

## Features

- **OAuth Authentication**: Secure Google OAuth 2.0 integration with token management
- **Data Import**: Automated GSC data import with pagination, retry logic, and idempotence
- **URL Normalization**: Intelligent URL normalization for consistent data aggregation
- **Caching**: Redis-based caching for improved performance
- **Error Handling**: Comprehensive error handling with standardized API responses
- **Observability**: Health checks, metrics, and structured logging
- **Security**: API key authentication, IP whitelisting, and encrypted token storage

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+ (optional but recommended)
- Google Cloud Project with Search Console API enabled

### 1. Environment Setup

```bash
cp .env.example .env
```

Configure your environment variables:

```env
# Server
PORT=8021
NODE_ENV=development

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URI=http://localhost:8021/auth/callback

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gsc_connector
DB_USER=postgres
DB_PASSWORD=password

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
ENCRYPTION_KEY=your_32_character_encryption_key
API_KEY=your_internal_api_key
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Create database
createdb gsc_connector

# Schema will be initialized automatically on first run
npm start
```

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Search Console API
4. Create OAuth 2.0 credentials (Web Application)
5. Add redirect URI: `http://localhost:8021/auth/callback`
6. Update `.env` with your credentials

## API Endpoints

### Authentication

#### `GET /auth/url`
Generate OAuth authentication URL.

**Response:**
```json
{
  "success": true,
  "auth_url": "https://accounts.google.com/oauth/authorize?..."
}
```

#### `GET /auth/callback`
Handle OAuth callback (used by Google).

#### `GET /auth/status`
Check authentication status.

### GSC Data Management

#### `GET /gsc/properties`
List available GSC properties.

**Response:**
```json
{
  "success": true,
  "properties": [
    {
      "site_url": "https://example.com/",
      "type": "URL_PREFIX",
      "display_name": "example.com"
    }
  ]
}
```

#### `POST /gsc/import`
Import GSC data for a property.

**Request:**
```json
{
  "property": "https://example.com/",
  "start": "2024-01-01",
  "end": "2024-01-31",
  "dimensions": ["page", "query", "country", "device"],
  "searchType": "web",
  "dataState": "all",
  "dryRun": false
}
```

### Metrics

#### `GET /metrics/url`
Get metrics for a specific URL.

**Parameters:**
- `url` (required): The URL to get metrics for
- `start` (required): Start date (YYYY-MM-DD)
- `end` (required): End date (YYYY-MM-DD)
- `country` (optional): Filter by country code
- `device` (optional): Filter by device type

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/page",
    "timeseries": [
      {
        "date": "2024-01-01",
        "clicks": 150,
        "impressions": 2500,
        "ctr": 0.06,
        "avg_position": 12.5
      }
    ],
    "totals": {
      "clicks": 4500,
      "impressions": 75000,
      "ctr": 0.06,
      "avg_position": 13.2
    },
    "meta": {
      "data_freshness_note": "Data is 2 days old (normal GSC delay)",
      "source": "GSC"
    }
  }
}
```

### Health & Monitoring

#### `GET /health`
Service health check.

#### `GET /ready`
Service readiness check.

#### `GET /metrics`
Service metrics and statistics.

## Development

### Running Locally

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Deployment

### Docker

```bash
# Build image
docker build -t gsc-connector .

# Run with docker-compose
docker-compose up -d
```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=8021
DB_HOST=your_db_host
REDIS_HOST=your_redis_host
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
OAUTH_REDIRECT_URI=https://your-domain.com/auth/callback
ENCRYPTION_KEY=your_secure_32_char_key
API_KEY=your_secure_api_key
ALLOWED_IPS=your_server_ips
```

## Data Flow

1. **Authentication**: Admin authenticates via OAuth to grant GSC access
2. **Property Discovery**: Service fetches available GSC properties
3. **Data Import**: Scheduled or manual import of GSC data with normalization
4. **Data Serving**: API endpoints serve cached, normalized metrics
5. **Cache Management**: Automatic cache invalidation on new imports

## URL Normalization

The service normalizes URLs to ensure consistent data aggregation:

- Converts to lowercase
- Removes tracking parameters (UTM, GCLID, etc.)
- Handles www/non-www consistently
- Standardizes trailing slashes
- Maintains original URLs for reference

## Security Features

- Encrypted token storage using AES-256
- API key authentication for internal access
- IP whitelisting support
- CORS configuration
- Helmet.js security headers
- Input validation with Joi
- Structured error responses without data leakage

## Monitoring & Observability

- Structured JSON logging with Winston
- Health and readiness endpoints
- Service metrics collection
- Request/response logging
- Error tracking and alerting
- Performance monitoring

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Dashboard     │────│ GSC Connector│────│ Google GSC  │
│                 │    │              │    │     API     │
└─────────────────┘    └──────────────┘    └─────────────┘
                              │
                       ┌──────┴──────┐
                       │             │
                  ┌─────────┐   ┌─────────┐
                  │PostgreSQL│   │  Redis  │
                  └─────────┘   └─────────┘
```

## License

ISC

## Support

For issues and questions, please check the application logs and health endpoints first. The service provides detailed error messages and diagnostic information through its API responses.