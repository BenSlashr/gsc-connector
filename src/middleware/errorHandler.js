const { createLogger } = require('../utils/logger');

const logger = createLogger('ErrorHandler');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message, code } = err;

  if (!err.isOperational) {
    logger.error('Unhandled error occurred', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      requestId: req.requestId
    });

    if (process.env.NODE_ENV === 'production') {
      message = 'Something went wrong';
      code = 'internal_server_error';
    }
  } else {
    logger.warn('Operational error occurred', {
      error: message,
      code,
      statusCode,
      url: req.url,
      method: req.method,
      requestId: req.requestId
    });
  }

  res.status(statusCode).json({
    success: false,
    error: code || 'error',
    message,
    request_id: req.requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
    request_id: req.requestId
  });
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};