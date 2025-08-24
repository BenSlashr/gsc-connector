const db = require('../config/database');
const redisClient = require('../config/redis');
const googleAuth = require('../services/googleAuth');
const { createLogger } = require('../utils/logger');

const logger = createLogger('HealthController');

class HealthController {
  async getHealth(req, res) {
    try {
      const checks = {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
        oauth: await this.checkOAuth()
      };

      const allHealthy = Object.values(checks).every(check => check.healthy);
      const statusCode = allHealthy ? 200 : 503;

      res.status(statusCode).json({
        success: true,
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.floor(process.uptime()),
        checks
      });
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  async getReady(req, res) {
    try {
      const dbHealthy = await this.checkDatabase();
      const oauthHealthy = await this.checkOAuth();

      const isReady = dbHealthy.healthy && oauthHealthy.healthy;

      if (isReady) {
        const hasValidAccess = await googleAuth.testAccess();
        
        res.json({
          success: true,
          status: 'ready',
          authenticated: hasValidAccess,
          timestamp: new Date().toISOString(),
          message: hasValidAccess ? 'Service is ready' : 'Service is ready but needs authentication'
        });
      } else {
        res.status(503).json({
          success: false,
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          message: 'Service dependencies are not ready'
        });
      }
    } catch (error) {
      logger.error('Readiness check failed', { error: error.message });
      
      res.status(503).json({
        success: false,
        status: 'not_ready',
        error: 'Readiness check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  async getMetrics(req, res) {
    try {
      const metrics = await this.collectMetrics();
      
      res.json({
        success: true,
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Metrics collection failed', { error: error.message });
      
      res.status(500).json({
        success: false,
        error: 'Metrics collection failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  async checkDatabase() {
    try {
      // Test simple de connexion à la base de données
      const result = await db.query('SELECT 1 as test');
      
      if (result && result.rows && result.rows.length > 0) {
        try {
          // Essayer de compter les comptes OAuth
          const accountsResult = await db.query('SELECT COUNT(*) as count FROM oauth_google_accounts');
          return {
            healthy: true,
            message: 'Database connection is healthy',
            accounts_count: parseInt(accountsResult.rows[0].count || 0)
          };
        } catch (tableError) {
          // Si la table n'existe pas encore, c'est OK
          return {
            healthy: true,
            message: 'Database connection is healthy (schema pending)',
            accounts_count: 0
          };
        }
      } else {
        return {
          healthy: false,
          message: 'Database connection failed'
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Database error: ${error.message}`
      };
    }
  }

  async checkRedis() {
    try {
      const healthy = await redisClient.healthCheck();
      
      return {
        healthy,
        message: healthy ? 'Redis connection is healthy' : 'Redis connection failed',
        connected: redisClient.isConnected
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Redis error: ${error.message}`,
        connected: false
      };
    }
  }

  async checkOAuth() {
    try {
      const account = await require('../models/OAuthAccount').getActiveAccount();
      
      if (account) {
        return {
          healthy: true,
          message: 'OAuth account available',
          email: account.email,
          has_refresh_token: !!account.refresh_token
        };
      } else {
        return {
          healthy: false,
          message: 'No OAuth account found'
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `OAuth check failed: ${error.message}`
      };
    }
  }

  async collectMetrics() {
    const [
      propertiesCount,
      recentImports,
      totalRows,
      systemMetrics
    ] = await Promise.all([
      this.getPropertiesCount(),
      this.getRecentImports(),
      this.getTotalRows(),
      this.getSystemMetrics()
    ]);

    return {
      properties: propertiesCount,
      imports: recentImports,
      data: totalRows,
      system: systemMetrics
    };
  }

  async getPropertiesCount() {
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM gsc_properties WHERE is_active = true');
      return { count: parseInt(result.rows[0].count) };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getRecentImports() {
    try {
      const result = await db.query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(rows_imported) as avg_rows,
          MAX(completed_at) as last_import
        FROM import_jobs 
        WHERE created_at > datetime('now', '-24 hours')
        GROUP BY status
      `);

      return result.rows.reduce((acc, row) => {
        acc[row.status] = {
          count: parseInt(row.count),
          avg_rows: row.avg_rows ? parseFloat(row.avg_rows) : null,
          last_import: row.last_import
        };
        return acc;
      }, {});
    } catch (error) {
      return { error: error.message };
    }
  }

  async getTotalRows() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT site_url) as unique_sites,
          MIN(date) as earliest_date,
          MAX(date) as latest_date,
          MAX(ingested_at) as last_ingestion
        FROM gsc_search_analytics
      `);

      return result.rows[0];
    } catch (error) {
      return { error: error.message };
    }
  }

  getSystemMetrics() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      node_version: process.version,
      pid: process.pid
    };
  }
}

module.exports = new HealthController();