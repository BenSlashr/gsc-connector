const redisClient = require('../config/redis');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Cache');

const cacheMiddleware = (ttl = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req);
    
    try {
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        logger.info('Cache hit', { key: cacheKey });
        
        return res.json({
          ...cachedData,
          _meta: {
            ...cachedData._meta,
            cached: true,
            cache_key: cacheKey
          }
        });
      }

      logger.debug('Cache miss', { key: cacheKey });
      
      const originalSend = res.send;
      res.send = function(body) {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            const cacheTtl = ttl || getCacheTtl(req.path);
            
            redisClient.set(cacheKey, data, cacheTtl);
            
            logger.debug('Response cached', { 
              key: cacheKey, 
              ttl: cacheTtl 
            });
          } catch (error) {
            logger.warn('Failed to cache response', { 
              key: cacheKey, 
              error: error.message 
            });
          }
        }
        
        originalSend.call(this, body);
      };

    } catch (error) {
      logger.error('Cache middleware error', { 
        key: cacheKey, 
        error: error.message 
      });
    }

    next();
  };
};

const invalidateCache = async (pattern) => {
  try {
    await redisClient.delPattern(pattern);
    logger.info('Cache invalidated', { pattern });
  } catch (error) {
    logger.error('Cache invalidation failed', { 
      pattern, 
      error: error.message 
    });
  }
};

const invalidateCacheForSite = async (siteUrl, startDate = null, endDate = null) => {
  const patterns = [
    `metrics:url:${siteUrl}:*`,
    `metrics:urls:${siteUrl}:*`
  ];

  if (startDate && endDate) {
    patterns.push(`metrics:url:${siteUrl}:*:${startDate}:${endDate}:*`);
    patterns.push(`metrics:urls:${siteUrl}:*:${startDate}:${endDate}:*`);
  }

  await Promise.all(patterns.map(pattern => invalidateCache(pattern)));
};

function generateCacheKey(req) {
  const parts = ['api', req.path.replace(/^\//, '').replace(/\//g, ':')];
  
  const queryKeys = Object.keys(req.query).sort();
  queryKeys.forEach(key => {
    if (key !== 'api_key') {
      parts.push(`${key}:${req.query[key]}`);
    }
  });

  return parts.join(':');
}

function getCacheTtl(path) {
  const defaultTtl = parseInt(process.env.CACHE_TTL) || 86400;
  const metricsTtl = parseInt(process.env.METRICS_CACHE_TTL) || 172800;

  if (path.includes('/metrics/')) {
    return metricsTtl;
  }

  if (path.includes('/gsc/properties')) {
    return 3600;
  }

  return defaultTtl;
}

module.exports = {
  cacheMiddleware,
  invalidateCache,
  invalidateCacheForSite
};