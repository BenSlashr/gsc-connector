const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const db = require('./config/database');
const redisClient = require('./config/redis');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { validateIpWhitelist } = require('./middleware/auth');
const { cacheMiddleware } = require('./middleware/cache');
const { createLogger } = require('./utils/logger');

const authRoutes = require('./routes/auth');
const gscRoutes = require('./routes/gsc');
const metricsRoutes = require('./routes/metrics');
const healthRoutes = require('./routes/health-simple');

const logger = createLogger('App');

class GSCConnectorApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8021;
    this.basePath = process.env.BASE_PATH || '';
  }

  setupMiddleware() {
    this.app.use(helmet());
    
    const corsOptions = {
      origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : false,
      credentials: true,
      optionsSuccessStatus: 200
    };
    this.app.use(cors(corsOptions));

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.app.use(requestLogger);
    
    if (process.env.ALLOWED_IPS) {
      this.app.use(validateIpWhitelist);
    }

    this.app.set('trust proxy', true);
  }

  setupRoutes() {
    // Root endpoint first
    this.app.get(this.basePath + '/', (req, res) => {
      res.json({
        name: 'GSC Connector',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        basePath: this.basePath,
        endpoints: [
          `GET ${this.basePath}/health - Health check`,
          `GET ${this.basePath}/ready - Readiness check`,
          `GET ${this.basePath}/metrics - Service metrics`,
          `GET ${this.basePath}/auth/url - Get OAuth URL`,
          `GET ${this.basePath}/auth/callback - OAuth callback`,
          `GET ${this.basePath}/auth/status - Auth status`,
          `GET ${this.basePath}/gsc/properties - List GSC properties`,
          `GET ${this.basePath}/gsc/check-access - Check property access`,
          `POST ${this.basePath}/gsc/import - Import GSC data`,
          `GET ${this.basePath}/metrics/url - Get URL metrics`,
          `GET ${this.basePath}/metrics/urls - List URLs with metrics`
        ]
      });
    });

    // Health and monitoring routes
    this.app.use(this.basePath, healthRoutes);
    
    this.app.use(this.basePath + '/auth', authRoutes);
    this.app.use(this.basePath + '/gsc', gscRoutes);
    this.app.use(this.basePath + '/metrics', cacheMiddleware(), metricsRoutes);

    this.app.use('*', notFoundHandler);
  }

  setupErrorHandling() {
    this.app.use(errorHandler);

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', { promise, reason });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
  }

  async initialize() {
    try {
      logger.info('Initializing GSC Connector...');

      // Mode stateless - base de données optionnelle
      if (process.env.SKIP_DB_INIT !== 'true') {
        try {
          await db.initializeSchema();
          logger.info('Database schema initialized');
        } catch (dbError) {
          logger.warn('Database initialization skipped:', dbError.message);
        }
      } else {
        logger.info('Database skipped (SKIP_DB_INIT=true)');
      }

      // Cache Redis optionnel
      if (process.env.REDIS_HOST && process.env.SKIP_REDIS !== 'true') {
        try {
          await redisClient.connect();
          logger.info('Redis connected');
        } catch (redisError) {
          logger.warn('Redis connection skipped:', redisError.message);
        }
      } else {
        logger.info('Redis skipped (SKIP_REDIS=true)');
      }

      logger.info('GSC Connector initialized successfully (stateless mode)');
    } catch (error) {
      logger.error('Failed to initialize GSC Connector', { error: error.message });
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();
      
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();

      this.server = this.app.listen(this.port, () => {
        logger.info(`GSC Connector listening on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        
        if (process.env.NODE_ENV !== 'production') {
          logger.info('Available endpoints:');
          logger.info(`- Health: http://localhost:${this.port}${this.basePath}/health`);
          logger.info(`- OAuth: http://localhost:${this.port}${this.basePath}/auth/url`);
          logger.info(`- Properties: http://localhost:${this.port}${this.basePath}/gsc/properties`);
        }
      });

    } catch (error) {
      logger.error('Failed to start GSC Connector', { error: error.message });
      process.exit(1);
    }
  }

  async gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    if (this.server) {
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await db.close();
          logger.info('Database connection closed');

          await redisClient.close();
          logger.info('Redis connection closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error: error.message });
          process.exit(1);
        }
      });
    } else {
      process.exit(0);
    }
  }
}

if (require.main === module) {
  const app = new GSCConnectorApp();
  app.start();
}

module.exports = GSCConnectorApp;