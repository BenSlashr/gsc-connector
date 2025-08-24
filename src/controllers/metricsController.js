const SearchAnalytics = require('../models/SearchAnalytics');
const { normalizeUrl } = require('../utils/urlNormalizer');
const { createLogger } = require('../utils/logger');
const Joi = require('joi');

const logger = createLogger('MetricsController');

const metricsSchema = Joi.object({
  url: Joi.string().uri().required(),
  start: Joi.date().iso().required(),
  end: Joi.date().iso().min(Joi.ref('start')).required(),
  country: Joi.string().length(3).optional(),
  device: Joi.string().valid('desktop', 'mobile', 'tablet').optional(),
  siteUrl: Joi.string().optional()
});

class MetricsController {
  async getUrlMetrics(req, res) {
    try {
      const { error, value } = metricsSchema.validate(req.query);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: error.details[0].message
        });
      }

      const { url, start, end, country, device, siteUrl } = value;
      
      const targetSiteUrl = siteUrl || this.inferSiteUrl(url);
      if (!targetSiteUrl) {
        return res.status(400).json({
          success: false,
          error: 'invalid_url',
          message: 'Could not determine site URL from the provided URL'
        });
      }

      const normalizedUrl = normalizeUrl(url, targetSiteUrl);
      
      logger.info('Fetching URL metrics', { 
        url, 
        normalizedUrl, 
        targetSiteUrl, 
        start, 
        end, 
        filters: { country, device } 
      });

      const filters = {};
      if (country) filters.country = country;
      if (device) filters.device = device;

      const data = await SearchAnalytics.getMetricsForUrl(
        targetSiteUrl,
        normalizedUrl,
        start,
        end,
        filters
      );

      const dataFreshnessNote = this.getDataFreshnessNote(data.totals.last_data_date);

      res.json({
        success: true,
        data: {
          url: normalizedUrl,
          site_url: targetSiteUrl,
          period: {
            start: start,
            end: end
          },
          filters: filters,
          timeseries: data.timeseries.map(row => ({
            date: row.date.toISOString().split('T')[0],
            clicks: parseInt(row.clicks),
            impressions: parseInt(row.impressions),
            ctr: parseFloat(row.ctr.toFixed(4)),
            avg_position: parseFloat(row.avg_position.toFixed(2))
          })),
          totals: {
            clicks: parseInt(data.totals.total_clicks) || 0,
            impressions: parseInt(data.totals.total_impressions) || 0,
            ctr: parseFloat((data.totals.avg_ctr || 0).toFixed(4)),
            avg_position: parseFloat((data.totals.avg_position || 0).toFixed(2))
          },
          meta: {
            data_freshness_note: dataFreshnessNote,
            source: "GSC",
            last_updated: new Date().toISOString(),
            days_with_data: data.timeseries.length
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get URL metrics', { 
        error: error.message, 
        query: req.query 
      });
      
      res.status(500).json({
        success: false,
        error: 'metrics_fetch_failed',
        message: 'Failed to retrieve metrics data',
        request_id: req.requestId || 'unknown'
      });
    }
  }

  async getUrlList(req, res) {
    try {
      const schema = Joi.object({
        siteUrl: Joi.string().required(),
        start: Joi.date().iso().required(),
        end: Joi.date().iso().min(Joi.ref('start')).required(),
        limit: Joi.number().integer().min(1).max(1000).default(100),
        offset: Joi.number().integer().min(0).default(0),
        orderBy: Joi.string().valid('clicks', 'impressions', 'ctr', 'position').default('clicks'),
        order: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: error.details[0].message
        });
      }

      const { siteUrl, start, end, limit, offset, orderBy, order } = value;

      const query = `
        SELECT 
          page_normalized as url,
          SUM(total_clicks) as clicks,
          SUM(total_impressions) as impressions,
          CASE 
            WHEN SUM(total_impressions) > 0 THEN SUM(total_clicks)::DOUBLE PRECISION / SUM(total_impressions)::DOUBLE PRECISION
            ELSE 0
          END as ctr,
          CASE 
            WHEN SUM(total_impressions) > 0 THEN SUM(avg_position * total_impressions) / SUM(total_impressions)
            ELSE 0
          END as avg_position
        FROM gsc_url_daily
        WHERE site_url = $1 AND date >= $2 AND date <= $3
        GROUP BY page_normalized
        ORDER BY ${orderBy} ${order.toUpperCase()}
        LIMIT $4 OFFSET $5
      `;

      const countQuery = `
        SELECT COUNT(DISTINCT page_normalized) as total
        FROM gsc_url_daily
        WHERE site_url = $1 AND date >= $2 AND date <= $3
      `;

      const [dataResult, countResult] = await Promise.all([
        require('../config/database').query(query, [siteUrl, start, end, limit, offset]),
        require('../config/database').query(countQuery, [siteUrl, start, end])
      ]);

      res.json({
        success: true,
        data: {
          urls: dataResult.rows.map(row => ({
            url: row.url,
            clicks: parseInt(row.clicks),
            impressions: parseInt(row.impressions),
            ctr: parseFloat(row.ctr.toFixed(4)),
            avg_position: parseFloat(row.avg_position.toFixed(2))
          })),
          pagination: {
            limit,
            offset,
            total: parseInt(countResult.rows[0].total),
            has_more: offset + limit < parseInt(countResult.rows[0].total)
          },
          meta: {
            site_url: siteUrl,
            period: { start, end },
            source: "GSC"
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get URL list', { 
        error: error.message, 
        query: req.query 
      });
      
      res.status(500).json({
        success: false,
        error: 'url_list_fetch_failed',
        message: 'Failed to retrieve URL list',
        request_id: req.requestId || 'unknown'
      });
    }
  }

  inferSiteUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}/`;
    } catch (error) {
      return null;
    }
  }

  getDataFreshnessNote(lastDataDate) {
    if (!lastDataDate) {
      return "No recent data available";
    }

    const today = new Date();
    const lastDate = new Date(lastDataDate);
    const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 1) {
      return "Data is current (within 1 day)";
    } else if (daysDiff <= 3) {
      return `Data is ${daysDiff} days old (normal GSC delay)`;
    } else {
      return `Data is ${daysDiff} days old (may need refresh)`;
    }
  }
}

module.exports = new MetricsController();