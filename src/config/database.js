// Auto-sélection entre SQLite et PostgreSQL selon la configuration
const dbType = process.env.DB_TYPE || 'sqlite'; // 'sqlite' ou 'postgresql'

if (dbType === 'sqlite') {
  console.log('Using SQLite database');
  module.exports = require('./database-sqlite');
} else {
  console.log('Using PostgreSQL database');
  
  const { Pool } = require('pg');
  const fs = require('fs');
  const path = require('path');

  class PostgreSQLDatabase {
    constructor() {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'gsc_connector',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
      });
    }

    async query(text, params) {
      const client = await this.pool.connect();
      try {
        const result = await client.query(text, params);
        return result;
      } finally {
        client.release();
      }
    }

    async transaction(callback) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    async initializeSchema() {
      const schemaPath = path.join(__dirname, '../../sql/001_initial_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      try {
        await this.query(schemaSql);
        console.log('Database schema initialized successfully');
      } catch (error) {
        console.error('Failed to initialize database schema:', error.message);
        throw error;
      }
    }

    async refreshMaterializedView() {
      try {
        await this.query('SELECT refresh_gsc_url_daily()');
      } catch (error) {
        console.error('Failed to refresh materialized view:', error.message);
        throw error;
      }
    }

    async close() {
      await this.pool.end();
    }

    async healthCheck() {
      try {
        await this.query('SELECT 1');
        return true;
      } catch (error) {
        return false;
      }
    }
  }

  module.exports = new PostgreSQLDatabase();
}