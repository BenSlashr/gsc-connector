const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Request');

const requestLogger = (req, res, next) => {
  req.requestId = uuidv4();
  req.startTime = Date.now();

  logger.info('Request started', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - req.startTime;
    
    logger.info('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });

    originalSend.call(this, body);
  };

  next();
};

module.exports = requestLogger;