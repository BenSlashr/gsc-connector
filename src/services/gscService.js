const { google } = require('googleapis');
const googleAuth = require('./googleAuth');
const { normalizeUrl } = require('../utils/urlNormalizer');
const { createLogger } = require('../utils/logger');

// Only import database-related modules if not in skip mode
let GSCProperty, SearchAnalytics, db;
if (!process.env.SKIP_DB_SAVE) {
  GSCProperty = require('../models/GSCProperty');
  SearchAnalytics = require('../models/SearchAnalytics');
  db = require('../config/database');
}

const logger = createLogger('GSCService');

class GSCService {
  constructor() {
    this.defaultDimensions = ['page', 'query', 'country', 'device'];
    this.maxRowLimit = 25000;
    this.maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY_MS) || 1000;
  }

  async getProperties() {
    try {
      const authClient = await googleAuth.getAuthenticatedClient();
      const webmasters = google.webmasters({ version: 'v3', auth: authClient });
      
      const response = await webmasters.sites.list();
      const sites = response.data.siteEntry || [];
      
      const properties = sites.map(site => ({
        siteUrl: site.siteUrl,
        propertyType: site.siteUrl.startsWith('sc-domain:') ? 'DOMAIN_PROPERTY' : 'URL_PREFIX',
        displayName: site.siteUrl.replace('sc-domain:', '')
      }));

      // Save to database only if enabled
      if (!process.env.SKIP_DB_SAVE) {
        await GSCProperty.bulkUpsert(properties);
      } else {
        logger.info('Skipping database save for properties (SKIP_DB_SAVE=true)');
      }
      
      logger.info(`Retrieved ${properties.length} GSC properties`);
      
      return properties;
    } catch (error) {
      logger.error('Failed to fetch GSC properties', { error: error.message });
      throw this.handleGoogleAPIError(error);
    }
  }

  async checkAccess(siteUrl) {
    try {
      const authClient = await googleAuth.getAuthenticatedClient();
      const webmasters = google.webmasters({ version: 'v3', auth: authClient });
      
      await webmasters.sites.get({ siteUrl });
      return true;
    } catch (error) {
      if (error.code === 403) {
        return false;
      }
      throw this.handleGoogleAPIError(error);
    }
  }

  async importSearchAnalytics(params) {
    const {
      property,
      start,
      end,
      dimensions = this.defaultDimensions,
      searchType = 'web',
      dataState = 'all',
      filters = {},
      dryRun = false
    } = params;

    logger.info('Starting GSC import', { property, start, end, dimensions, searchType, dataState, dryRun });

    if (dryRun) {
      const estimation = await this.estimateRows(property, start, end, dimensions, searchType);
      return {
        status: 'dry_run_complete',
        estimation,
        message: `Estimated ${estimation.estimatedRows} rows would be imported`
      };
    }

    let jobId;
    try {
      // Create import job only if database is enabled
      if (!process.env.SKIP_DB_SAVE) {
        jobId = await this.createImportJob(property, start, end, dimensions, searchType, dataState);
        await this.updateJobStatus(jobId, 'running');
      } else {
        logger.info('Skipping import job creation (SKIP_DB_SAVE=true)');
        jobId = 'memory_' + Date.now(); // Generate a temporary ID for logging
      }
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      let totalRowsImported = 0;
      let allData = []; // Collect all data for stateless mode

      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        logger.info(`Importing data for ${dateStr}`);

        const dayData = await this.fetchDayData(property, dateStr, dimensions, searchType, dataState, filters);
        
        if (dayData.length > 0) {
          const normalizedData = dayData.map(row => ({
            ...row,
            pageNormalized: normalizeUrl(row.pageRaw, property)
          }));

          let rowsForThisDay = 0;
          if (!process.env.SKIP_DB_SAVE) {
            rowsForThisDay = await SearchAnalytics.bulkInsert(normalizedData);
            totalRowsImported += rowsForThisDay;
          } else {
            // For stateless mode, collect data and count rows
            allData.push(...normalizedData);
            rowsForThisDay = normalizedData.length;
            totalRowsImported += rowsForThisDay;
            logger.info(`Collected ${rowsForThisDay} rows for ${dateStr} (stateless mode)`);
          }
          
          logger.info(`Processed ${rowsForThisDay} rows for ${dateStr}`);
        }

        await this.delay(100);
      }

      if (!process.env.SKIP_DB_SAVE) {
        await db.refreshMaterializedView();
        await this.updateJobStatus(jobId, 'completed', null, totalRowsImported);
      } else {
        logger.info('Skipping materialized view refresh and job status update (SKIP_DB_SAVE=true)');
      }

      logger.info('GSC import completed', { property, totalRowsImported });

      const result = {
        status: 'completed',
        jobId,
        rowsImported: totalRowsImported,
        message: `Successfully imported ${totalRowsImported} rows`
      };

      // In stateless mode, return the actual data
      if (process.env.SKIP_DB_SAVE && allData.length > 0) {
        result.data = allData;
        result.message = `Successfully retrieved ${totalRowsImported} rows`;
      }

      return result;

    } catch (error) {
      logger.error('GSC import failed', { error: error.message, property });
      
      if (jobId && !process.env.SKIP_DB_SAVE) {
        await this.updateJobStatus(jobId, 'failed', error.message);
      }
      
      throw error;
    }
  }

  async fetchDayData(property, date, dimensions, searchType, dataState, filters) {
    const authClient = await googleAuth.getAuthenticatedClient();
    const webmasters = google.webmasters({ version: 'v3', auth: authClient });

    const requestBody = {
      startDate: date,
      endDate: date,
      dimensions,
      rowLimit: this.maxRowLimit,
      startRow: 0,
      searchType,
      dataState
    };

    if (filters.country) {
      requestBody.dimensionFilterGroups = [{
        filters: [{
          dimension: 'country',
          operator: 'equals',
          expression: filters.country
        }]
      }];
    }

    const allRows = [];
    let startRow = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      requestBody.startRow = startRow;
      
      let response;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          response = await webmasters.searchanalytics.query({
            siteUrl: property,
            requestBody
          });
          break;
        } catch (error) {
          if (attempt === this.maxRetries) {
            throw this.handleGoogleAPIError(error);
          }
          
          if (error.code === 429) {
            const delay = this.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
            logger.warn(`Rate limited, retrying in ${delay}ms`, { attempt, property, date });
            await this.delay(delay);
          } else {
            throw error;
          }
        }
      }

      const rows = response.data.rows || [];
      
      if (rows.length === 0) {
        hasMoreData = false;
        break;
      }

      const processedRows = rows.map(row => ({
        siteUrl: property,
        date,
        pageRaw: row.keys[dimensions.indexOf('page')] || '',
        query: row.keys[dimensions.indexOf('query')] || '',
        country: row.keys[dimensions.indexOf('country')] || 'UNKNOWN',
        device: row.keys[dimensions.indexOf('device')] || 'UNKNOWN',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
        searchType,
        dataState
      }));

      allRows.push(...processedRows);
      
      startRow += rows.length;
      hasMoreData = rows.length === this.maxRowLimit;

      // Log progress for large datasets
      if (allRows.length > 0 && allRows.length % 25000 === 0) {
        logger.info(`Fetched ${allRows.length} rows for ${date}, continuing pagination...`, { 
          property, 
          currentBatch: Math.floor(allRows.length / 25000),
          hasMoreData 
        });
      }

      if (hasMoreData) {
        // Adaptive delay: longer for large datasets to avoid rate limiting
        const delay = allRows.length > 100000 ? 500 : 200;
        await this.delay(delay);
      }
    }

    logger.info(`Completed fetching data for ${date}`, { 
      property, 
      totalRows: allRows.length,
      batchesFetched: Math.ceil(allRows.length / this.maxRowLimit) 
    });

    return allRows;
  }

  async estimateRows(property, start, end, dimensions, searchType) {
    try {
      const authClient = await googleAuth.getAuthenticatedClient();
      const webmasters = google.webmasters({ version: 'v3', auth: authClient });

      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // Sample 3 days to get better estimation
      const sampleDays = Math.min(3, daysDiff);
      let totalSampleRows = 0;
      let sampleCount = 0;

      for (let i = 0; i < sampleDays; i++) {
        const sampleDate = new Date(startDate);
        sampleDate.setDate(sampleDate.getDate() + Math.floor(i * daysDiff / sampleDays));
        const sampleDateStr = sampleDate.toISOString().split('T')[0];

        try {
          // Get actual row count for sample day with rowLimit 0 (returns metadata only)
          const response = await webmasters.searchanalytics.query({
            siteUrl: property,
            requestBody: {
              startDate: sampleDateStr,
              endDate: sampleDateStr,
              dimensions,
              rowLimit: 1,
              searchType
            }
          });

          // Try to estimate based on response patterns
          // Google API doesn't give total counts, so we estimate based on dimensions
          let estimatedForDay = 1000; // Base estimate
          
          // Adjust based on dimensions
          if (dimensions.includes('query')) estimatedForDay *= 10;
          if (dimensions.includes('page')) estimatedForDay *= 5;
          if (dimensions.includes('country')) estimatedForDay *= 2;
          if (dimensions.includes('device')) estimatedForDay *= 3;

          totalSampleRows += estimatedForDay;
          sampleCount++;
          
          await this.delay(100); // Small delay between samples
        } catch (sampleError) {
          logger.warn(`Failed to sample date ${sampleDateStr}`, { error: sampleError.message });
        }
      }

      const avgRowsPerDay = sampleCount > 0 ? Math.floor(totalSampleRows / sampleCount) : 5000;
      const estimatedRows = avgRowsPerDay * daysDiff;

      return {
        estimatedRows,
        avgRowsPerDay,
        dayCount: daysDiff,
        dimensions,
        searchType,
        sampleDays: sampleCount
      };
    } catch (error) {
      logger.warn('Failed to estimate rows', { error: error.message });
      return {
        estimatedRows: 'unknown',
        dayCount: 'unknown',
        dimensions,
        searchType
      };
    }
  }

  async createImportJob(property, start, end, dimensions, searchType, dataState) {
    const query = `
      INSERT INTO import_jobs (site_url, start_date, end_date, dimensions, search_type, data_state, status, started_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING id
    `;

    const result = await db.query(query, [property, start, end, dimensions, searchType, dataState]);
    return result.rows[0].id;
  }

  async updateJobStatus(jobId, status, errorMessage = null, rowsImported = null) {
    const query = `
      UPDATE import_jobs 
      SET status = $2, error_message = $3, rows_imported = $4, completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE id = $1
    `;

    await db.query(query, [jobId, status, errorMessage, rowsImported]);
  }

  handleGoogleAPIError(error) {
    const { code, message } = error;

    if (code === 403) {
      if (message.includes('insufficient')) {
        return new Error('insufficient_permissions: Account does not have access to this property');
      }
      return new Error('forbidden: Access denied to Google Search Console API');
    }

    if (code === 401) {
      if (message.includes('invalid_grant')) {
        return new Error('oauth_token_revoked: Please re-authenticate via /auth/url');
      }
      return new Error('unauthorized: Invalid or expired authentication');
    }

    if (code === 400) {
      if (message.includes('redirect_uri_mismatch')) {
        return new Error('redirect_uri_mismatch: OAuth redirect URI does not match configured value');
      }
      return new Error(`invalid_request: ${message}`);
    }

    if (code === 429) {
      return new Error('rate_limited: Too many requests, please try again later');
    }

    if (code >= 500) {
      return new Error('google_api_unavailable: Google API temporarily unavailable');
    }

    return error;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new GSCService();