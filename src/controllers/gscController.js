const gscService = require('../services/gscService');
const { createLogger } = require('../utils/logger');
const Joi = require('joi');

const logger = createLogger('GSCController');

const importSchema = Joi.object({
  property: Joi.string().required(),
  start: Joi.date().iso().required(),
  end: Joi.date().iso().min(Joi.ref('start')).required(),
  dimensions: Joi.array().items(Joi.string().valid('page', 'query', 'country', 'device')).default(['page', 'query', 'country', 'device']),
  searchType: Joi.string().valid('web', 'image', 'video').default('web'),
  dataState: Joi.string().valid('all', 'final').default('all'),
  filters: Joi.object({
    country: Joi.string().length(3),
    device: Joi.string().valid('desktop', 'mobile', 'tablet'),
    pageRegex: Joi.string()
  }).default({}),
  dryRun: Joi.boolean().default(false)
});

class GSCController {
  async getProperties(req, res) {
    try {
      const properties = await gscService.getProperties();
      
      logger.info(`Retrieved ${properties.length} properties`);
      
      res.json({
        success: true,
        properties: properties.map(p => ({
          site_url: p.siteUrl,
          type: p.propertyType,
          display_name: p.displayName
        }))
      });
    } catch (error) {
      logger.error('Failed to get properties', { error: error.message });
      
      this.handleError(res, error);
    }
  }

  async checkAccess(req, res) {
    try {
      const { property } = req.query;
      
      if (!property) {
        return res.status(400).json({
          success: false,
          error: 'missing_property',
          message: 'Property parameter is required'
        });
      }

      const hasAccess = await gscService.checkAccess(property);
      
      res.json({
        success: true,
        hasAccess,
        property,
        message: hasAccess ? 'Access confirmed' : 'No access to this property'
      });
    } catch (error) {
      logger.error('Failed to check access', { error: error.message, property: req.query.property });
      
      this.handleError(res, error);
    }
  }

  async importData(req, res) {
    try {
      const { error, value } = importSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: error.details[0].message
        });
      }

      logger.info('Starting GSC import', value);

      const result = await gscService.importSearchAnalytics(value);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Import failed', { error: error.message, params: req.body });
      
      this.handleError(res, error);
    }
  }

  handleError(res, error) {
    const message = error.message || 'Unknown error';
    let statusCode = 500;
    let errorCode = 'internal_error';

    if (message.includes('redirect_uri_mismatch')) {
      statusCode = 400;
      errorCode = 'redirect_uri_mismatch';
    } else if (message.includes('oauth_token_revoked')) {
      statusCode = 401;
      errorCode = 'oauth_token_revoked';
    } else if (message.includes('insufficient_permissions')) {
      statusCode = 403;
      errorCode = 'insufficient_permissions';
    } else if (message.includes('rate_limited')) {
      statusCode = 429;
      errorCode = 'rate_limited';
    } else if (message.includes('google_api_unavailable')) {
      statusCode = 503;
      errorCode = 'google_api_unavailable';
    } else if (message.includes('validation_error')) {
      statusCode = 400;
      errorCode = 'validation_error';
    }

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: message,
      request_id: req.requestId || 'unknown'
    });
  }
}

module.exports = new GSCController();