const db = require('../config/database');

class SearchAnalytics {
  static async bulkInsert(records) {
    if (records.length === 0) return 0;

    const columns = [
      'site_url', 'date', 'page_normalized', 'query', 'country', 'device',
      'clicks', 'impressions', 'ctr', 'position', 'page_raw', 'search_type', 'data_state'
    ];

    const values = records.map((_, index) => {
      const offset = index * columns.length;
      return `(${columns.map((_, i) => `$${offset + i + 1}`).join(', ')})`;
    }).join(', ');

    const params = records.flatMap(record => [
      record.siteUrl,
      record.date,
      record.pageNormalized,
      record.query,
      record.country,
      record.device,
      record.clicks,
      record.impressions,
      record.ctr,
      record.position,
      record.pageRaw,
      record.searchType,
      record.dataState
    ]);

    const query = `
      INSERT INTO gsc_search_analytics (${columns.join(', ')})
      VALUES ${values}
      ON CONFLICT (site_url, date, page_normalized, query, country, device)
      DO UPDATE SET 
        clicks = EXCLUDED.clicks,
        impressions = EXCLUDED.impressions,
        ctr = EXCLUDED.ctr,
        position = EXCLUDED.position,
        page_raw = EXCLUDED.page_raw,
        data_state = EXCLUDED.data_state,
        ingested_at = NOW()
    `;

    const result = await db.query(query, params);
    return result.rowCount;
  }

  static async getMetricsForUrl(siteUrl, pageNormalized, startDate, endDate, filters = {}) {
    let whereClause = `
      WHERE site_url = $1 
      AND page_normalized = $2 
      AND date >= $3 
      AND date <= $4
    `;
    
    const params = [siteUrl, pageNormalized, startDate, endDate];
    let paramIndex = 4;

    if (filters.country) {
      whereClause += ` AND country = $${++paramIndex}`;
      params.push(filters.country);
    }

    if (filters.device) {
      whereClause += ` AND device = $${++paramIndex}`;
      params.push(filters.device);
    }

    const timeseriesQuery = `
      SELECT 
        date,
        total_clicks as clicks,
        total_impressions as impressions,
        calculated_ctr as ctr,
        avg_position
      FROM gsc_url_daily
      ${whereClause}
      ORDER BY date
    `;

    const totalsQuery = `
      SELECT 
        SUM(total_clicks) as total_clicks,
        SUM(total_impressions) as total_impressions,
        CASE 
          WHEN SUM(total_impressions) > 0 THEN SUM(total_clicks)::DOUBLE PRECISION / SUM(total_impressions)::DOUBLE PRECISION
          ELSE 0
        END as avg_ctr,
        CASE 
          WHEN SUM(total_impressions) > 0 THEN SUM(avg_position * total_impressions) / SUM(total_impressions)
          ELSE 0
        END as avg_position,
        MAX(date) as last_data_date
      FROM gsc_url_daily
      ${whereClause}
    `;

    const [timeseriesResult, totalsResult] = await Promise.all([
      db.query(timeseriesQuery, params),
      db.query(totalsQuery, params)
    ]);

    return {
      timeseries: timeseriesResult.rows,
      totals: totalsResult.rows[0] || {
        total_clicks: 0,
        total_impressions: 0,
        avg_ctr: 0,
        avg_position: 0,
        last_data_date: null
      }
    };
  }

  static async getDateRange(siteUrl) {
    const query = `
      SELECT 
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(DISTINCT date) as total_days
      FROM gsc_search_analytics 
      WHERE site_url = $1
    `;

    const result = await db.query(query, [siteUrl]);
    return result.rows[0];
  }

  static async getImportStats(siteUrl, startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT page_normalized) as unique_pages,
        COUNT(DISTINCT query) as unique_queries,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        MAX(ingested_at) as last_import
      FROM gsc_search_analytics 
      WHERE site_url = $1 AND date >= $2 AND date <= $3
    `;

    const result = await db.query(query, [siteUrl, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = SearchAnalytics;