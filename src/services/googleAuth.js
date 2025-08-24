const { google } = require('googleapis');
const OAuthAccount = require('../models/OAuthAccount');

class GoogleAuthService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    this.scopes = [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
  }

  generateAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent'
    });
  }

  async exchangeCodeForTokens(code) {
    try {
      console.log('DEBUG: Attempting to exchange code for tokens');
      const { tokens } = await this.oauth2Client.getToken(code);
      console.log('DEBUG: Tokens received:', JSON.stringify(tokens, null, 2));
      
      if (!tokens) {
        throw new Error('No tokens received from Google OAuth API');
      }
      
      this.oauth2Client.setCredentials(tokens);
      
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();
      
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      
      if (!process.env.SKIP_DB_SAVE) {
        await OAuthAccount.create(
          userInfo.email,
          this.scopes.join(' '),
          tokens.access_token,
          tokens.refresh_token,
          expiresAt
        );
      } else {
        console.log('DEBUG: Skipping database save (SKIP_DB_SAVE=true)');
        console.log('DEBUG: Saving to memory store instead');
        
        // Store temporaire en mémoire
        const memoryStore = require('../../temp_memory_store');
        memoryStore.tokens = tokens;
        memoryStore.email = userInfo.email;
        console.log('DEBUG: Saved to memory:', { email: userInfo.email, hasTokens: !!tokens });
      }

      return {
        email: userInfo.email,
        tokens: tokens
      };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to exchange authorization code');
    }
  }

  async getValidAccessToken(email = null) {
    try {
      // Essayer d'abord le store mémoire
      const memoryStore = require('../../temp_memory_store');
      if (memoryStore.tokens && memoryStore.tokens.access_token) {
        console.log('DEBUG: Using tokens from memory store');
        
        const now = new Date();
        const expiresAt = memoryStore.tokens.expiry_date ? new Date(memoryStore.tokens.expiry_date) : null;
        
        if (!expiresAt || now >= expiresAt) {
          console.log('DEBUG: Token expired, refreshing...');
          return await this.refreshAccessTokenFromMemory();
        }
        
        return memoryStore.tokens.access_token;
      }
      
      // Fallback vers la base de données seulement si enabled
      if (!process.env.SKIP_DB_SAVE) {
        const account = email ? 
          await OAuthAccount.findByEmail(email) : 
          await OAuthAccount.getActiveAccount();

        if (!account) {
          throw new Error('No OAuth account found');
        }

        const now = new Date();
        const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null;

        if (!expiresAt || now >= expiresAt) {
          return await this.refreshAccessToken(account.email, account.refresh_token);
        }

        return account.access_token;
      } else {
        throw new Error('No valid authentication found in memory store. Please authenticate via /auth/url');
      }
    } catch (error) {
      console.error('Error getting valid access token:', error);
      throw error;
    }
  }

  async refreshAccessTokenFromMemory() {
    const memoryStore = require('../../temp_memory_store');
    
    try {
      this.oauth2Client.setCredentials({
        refresh_token: memoryStore.tokens.refresh_token
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Update memory store
      memoryStore.tokens = {
        ...memoryStore.tokens,
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date
      };
      
      console.log('DEBUG: Token refreshed in memory store');
      return credentials.access_token;
    } catch (error) {
      console.error('Error refreshing access token from memory:', error);
      throw error;
    }
  }

  async refreshAccessToken(email, refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
      
      await OAuthAccount.updateTokens(
        email,
        credentials.access_token,
        credentials.refresh_token || refreshToken,
        expiresAt
      );

      return credentials.access_token;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      
      if (error.message.includes('invalid_grant')) {
        await OAuthAccount.markTokenAsInvalid(email);
        throw new Error('Refresh token is invalid. Re-authentication required.');
      }
      
      throw error;
    }
  }

  async getAuthenticatedClient(email = null) {
    const accessToken = await this.getValidAccessToken(email);
    
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    client.setCredentials({ access_token: accessToken });
    return client;
  }

  async testAccess(email = null) {
    try {
      const authClient = await this.getAuthenticatedClient(email);
      const webmasters = google.webmasters({ version: 'v3', auth: authClient });
      
      await webmasters.sites.list();
      return true;
    } catch (error) {
      console.error('Access test failed:', error);
      return false;
    }
  }
}

module.exports = new GoogleAuthService();