const googleAuth = require('../services/googleAuth');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthController');

class AuthController {
  async getAuthUrl(req, res) {
    try {
      const authUrl = googleAuth.generateAuthUrl();
      
      logger.info('Generated OAuth URL');
      
      res.json({
        success: true,
        auth_url: authUrl
      });
    } catch (error) {
      logger.error('Failed to generate auth URL', { error: error.message });
      
      res.status(500).json({
        success: false,
        error: 'Failed to generate authentication URL',
        message: error.message
      });
    }
  }

  async handleCallback(req, res) {
    try {
      const { code, error } = req.query;

      if (error) {
        logger.warn('OAuth callback error', { error });
        return res.status(400).json({
          success: false,
          error: 'oauth_error',
          message: `OAuth error: ${error}`
        });
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'missing_code',
          message: 'Authorization code is required'
        });
      }

      const result = await googleAuth.exchangeCodeForTokens(code);
      
      logger.info('OAuth callback successful', { email: result.email });

      res.json({
        success: true,
        message: 'Authentication successful',
        email: result.email
      });
    } catch (error) {
      logger.error('OAuth callback failed', { error: error.message });

      let statusCode = 500;
      let errorCode = 'callback_error';

      if (error.message.includes('redirect_uri_mismatch')) {
        statusCode = 400;
        errorCode = 'redirect_uri_mismatch';
      } else if (error.message.includes('invalid_grant')) {
        statusCode = 400;
        errorCode = 'invalid_grant';
      }

      res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message
      });
    }
  }

  async getStatus(req, res) {
    try {
      const hasAccess = await googleAuth.testAccess();
      
      res.json({
        success: true,
        authenticated: hasAccess,
        message: hasAccess ? 'Authentication is valid' : 'No valid authentication found'
      });
    } catch (error) {
      logger.error('Failed to check auth status', { error: error.message });
      
      res.json({
        success: true,
        authenticated: false,
        message: 'Authentication check failed'
      });
    }
  }
}

module.exports = new AuthController();