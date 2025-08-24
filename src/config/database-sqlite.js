const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class SQLiteDatabase {
  constructor() {
    // Utiliser un chemin persistant pour SQLite
    const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'gsc_connector.sqlite');
    
    // Créer le dossier data s'il n'existe pas
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.dbPath = dbPath;
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
      } else {
        console.log('Connected to SQLite database:', dbPath);
      }
    });
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      // Adapter les requêtes PostgreSQL vers SQLite
      const sqliteSql = this.adaptPostgresToSQLite(sql);
      
      if (sqliteSql.trim().toLowerCase().startsWith('select')) {
        this.db.all(sqliteSql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve({ rows: rows || [] });
          }
        });
      } else {
        this.db.run(sqliteSql, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ 
              rows: [{ id: this.lastID }],
              rowsAffected: this.changes 
            });
          }
        });
      }
    });
  }

  adaptPostgresToSQLite(sql) {
    return sql
      // Remplacer les paramètres PostgreSQL $1, $2... par SQLite ?, ?...
      .replace(/\$(\d+)/g, '?')
      // Remplacer RETURNING * par une requête séparée (SQLite ne supporte pas RETURNING)
      .replace(/\s+RETURNING\s+\*/gi, '')
      // Remplacer NOW() par datetime('now')
      .replace(/NOW\(\)/gi, "datetime('now')")
      // Remplacer les types PostgreSQL
      .replace(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi, 'DATETIME')
      .replace(/TIMESTAMP/gi, 'DATETIME')
      .replace(/TEXT\[\]/gi, 'TEXT')
      // Adapter les ON CONFLICT pour SQLite
      .replace(/ON\s+CONFLICT\s*\([^)]+\)\s+DO\s+UPDATE\s+SET/gi, 'ON CONFLICT DO UPDATE SET')
      // Remplacer les fonctions PostgreSQL spécifiques
      .replace(/EXTRACT\(EPOCH FROM ([^)]+)\)/gi, 'strftime("%s", $1)')
      // Boolean pour SQLite
      .replace(/BOOLEAN/gi, 'INTEGER');
  }

  async transaction(callback) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);
          
          try {
            const result = callback(this);
            if (result instanceof Promise) {
              result
                .then((res) => {
                  this.db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve(res);
                  });
                })
                .catch((err) => {
                  this.db.run('ROLLBACK', () => reject(err));
                });
            } else {
              this.db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve(result);
              });
            }
          } catch (error) {
            this.db.run('ROLLBACK', () => reject(error));
          }
        });
      });
    });
  }

  async initializeSchema() {
    const schemaPath = path.join(__dirname, '../../sql/sqlite_schema.sql');
    
    try {
      let schemaSql;
      if (fs.existsSync(schemaPath)) {
        schemaSql = fs.readFileSync(schemaPath, 'utf8');
      } else {
        // Schema SQLite par défaut
        schemaSql = this.getDefaultSchema();
      }
      
      // Diviser le schema en requêtes individuelles
      const statements = schemaSql.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await this.query(statement);
        }
      }
      
      console.log('SQLite database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SQLite schema:', error.message);
      throw error;
    }
  }

  getDefaultSchema() {
    return `
      -- Table pour les comptes OAuth
      CREATE TABLE IF NOT EXISTS oauth_google_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        scope TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        access_token_expires_at DATETIME,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Table pour les propriétés GSC
      CREATE TABLE IF NOT EXISTS gsc_properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_url TEXT UNIQUE NOT NULL,
        property_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Table pour les données Search Analytics
      CREATE TABLE IF NOT EXISTS gsc_search_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_url TEXT NOT NULL,
        date TEXT NOT NULL,
        page_raw TEXT NOT NULL,
        page_normalized TEXT,
        query TEXT,
        country TEXT DEFAULT 'UNKNOWN',
        device TEXT DEFAULT 'UNKNOWN',
        clicks INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        ctr REAL DEFAULT 0,
        position REAL DEFAULT 0,
        search_type TEXT DEFAULT 'web',
        data_state TEXT DEFAULT 'all',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(site_url, date, page_raw, query, country, device)
      );

      -- Index pour optimiser les requêtes
      CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_site_date ON gsc_search_analytics(site_url, date);
      CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_normalized ON gsc_search_analytics(page_normalized);
      CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_query ON gsc_search_analytics(query);
      CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_clicks ON gsc_search_analytics(clicks DESC);

      -- Table pour les jobs d'import
      CREATE TABLE IF NOT EXISTS import_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_url TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        dimensions TEXT NOT NULL,
        search_type TEXT DEFAULT 'web',
        data_state TEXT DEFAULT 'all',
        status TEXT DEFAULT 'pending',
        rows_imported INTEGER DEFAULT 0,
        error_message TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );
    `;
  }

  async refreshMaterializedView() {
    // SQLite n'a pas de vues matérialisées, on peut ignorer ou créer une vue normale
    console.log('SQLite: Materialized view refresh skipped (not supported)');
    return true;
  }

  async close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing SQLite database:', err.message);
        } else {
          console.log('SQLite database connection closed');
        }
        resolve();
      });
    });
  }

  async healthCheck() {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('SQLite health check failed:', error.message);
      return false;
    }
  }
}

module.exports = new SQLiteDatabase();