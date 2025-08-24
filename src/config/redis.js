const redis = require('redis');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Disconnected from Redis');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache get', { key });
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get failed', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttl = null) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set', { key });
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      logger.error('Redis set failed', { key, error: error.message });
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache delete', { key });
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis delete failed', { key, error: error.message });
      return false;
    }
  }

  async delPattern(pattern) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping pattern delete', { pattern });
      return false;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Redis pattern delete failed', { pattern, error: error.message });
      return false;
    }
  }

  async exists(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists check failed', { key, error: error.message });
      return false;
    }
  }

  async close() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
    }
  }

  async healthCheck() {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  generateCacheKey(...parts) {
    return parts.filter(p => p !== null && p !== undefined).join(':');
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;