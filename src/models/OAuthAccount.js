const crypto = require('crypto');
const db = require('../config/database');

class OAuthAccount {
  static encryptToken(token) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || '12345678901234567890123456789012', 'utf8');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  static decryptToken(encryptedToken) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || '12345678901234567890123456789012', 'utf8');
    
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipher(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  static async create(email, scopes, accessToken, refreshToken, expiresAt) {
    const encryptedAccessToken = accessToken ? this.encryptToken(accessToken) : null;
    const encryptedRefreshToken = this.encryptToken(refreshToken);
    
    const query = `
      INSERT INTO oauth_google_accounts (email, scopes, access_token, refresh_token, access_token_expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) 
      DO UPDATE SET 
        scopes = $2,
        access_token = $3,
        refresh_token = $4,
        access_token_expires_at = $5,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await db.query(query, [
      email,
      scopes,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt
    ]);

    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM oauth_google_accounts WHERE email = $1';
    const result = await db.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const account = result.rows[0];
    
    if (account.access_token) {
      account.access_token = this.decryptToken(account.access_token);
    }
    account.refresh_token = this.decryptToken(account.refresh_token);
    
    return account;
  }

  static async updateTokens(email, accessToken, refreshToken, expiresAt) {
    const encryptedAccessToken = accessToken ? this.encryptToken(accessToken) : null;
    const encryptedRefreshToken = refreshToken ? this.encryptToken(refreshToken) : null;
    
    const query = `
      UPDATE oauth_google_accounts 
      SET access_token = $2, refresh_token = COALESCE($3, refresh_token), access_token_expires_at = $4
      WHERE email = $1
      RETURNING *
    `;

    const result = await db.query(query, [
      email,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt
    ]);

    return result.rows[0];
  }

  static async markTokenAsInvalid(email) {
    const query = `
      UPDATE oauth_google_accounts 
      SET access_token = NULL, access_token_expires_at = NULL
      WHERE email = $1
    `;

    await db.query(query, [email]);
  }

  static async getActiveAccount() {
    const query = 'SELECT * FROM oauth_google_accounts ORDER BY updated_at DESC LIMIT 1';
    const result = await db.query(query);
    
    if (result.rows.length === 0) {
      return null;
    }

    const account = result.rows[0];
    
    if (account.access_token) {
      account.access_token = this.decryptToken(account.access_token);
    }
    account.refresh_token = this.decryptToken(account.refresh_token);
    
    return account;
  }
}

module.exports = OAuthAccount;