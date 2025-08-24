const { AppError } = require('./errorHandler');

const requireApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key') || req.query.api_key;
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    return next(new AppError('API key authentication is not configured', 500, 'auth_not_configured'));
  }

  if (!apiKey) {
    return next(new AppError('API key is required', 401, 'api_key_required'));
  }

  if (apiKey !== expectedApiKey) {
    return next(new AppError('Invalid API key', 403, 'invalid_api_key'));
  }

  next();
};

const validateIpWhitelist = (req, res, next) => {
  if (!process.env.ALLOWED_IPS) {
    return next();
  }

  const allowedIps = process.env.ALLOWED_IPS.split(',').map(ip => ip.trim());
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!allowedIps.includes(clientIp) && !allowedIps.includes('*')) {
    return next(new AppError(`IP ${clientIp} is not authorized`, 403, 'ip_not_allowed'));
  }

  next();
};

module.exports = {
  requireApiKey,
  validateIpWhitelist
};