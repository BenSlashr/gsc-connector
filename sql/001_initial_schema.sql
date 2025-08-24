-- Google Search Console Connector Database Schema

-- OAuth tokens storage
CREATE TABLE oauth_google_accounts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    scopes TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT NOT NULL,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GSC Properties catalog
CREATE TABLE gsc_properties (
    id SERIAL PRIMARY KEY,
    site_url VARCHAR(500) NOT NULL UNIQUE,
    property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('DOMAIN_PROPERTY', 'URL_PREFIX')),
    display_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Main search analytics data table
CREATE TABLE gsc_search_analytics (
    site_url VARCHAR(500) NOT NULL,
    date DATE NOT NULL,
    page_normalized VARCHAR(2048) NOT NULL,
    query VARCHAR(2048) NOT NULL,
    country VARCHAR(3) NOT NULL,
    device VARCHAR(20) NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    page_raw VARCHAR(2048) NOT NULL,
    search_type VARCHAR(20) NOT NULL DEFAULT 'web',
    data_state VARCHAR(10) NOT NULL DEFAULT 'all' CHECK (data_state IN ('all', 'final')),
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (site_url, date, page_normalized, query, country, device)
);

-- Indexes for performance
CREATE INDEX idx_gsc_analytics_site_date ON gsc_search_analytics(site_url, date);
CREATE INDEX idx_gsc_analytics_page_normalized ON gsc_search_analytics(page_normalized);
CREATE INDEX idx_gsc_analytics_date ON gsc_search_analytics(date);
CREATE INDEX idx_gsc_analytics_ingested_at ON gsc_search_analytics(ingested_at);

-- Materialized view for URL daily aggregates
CREATE MATERIALIZED VIEW gsc_url_daily AS
SELECT 
    site_url,
    date,
    page_normalized,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE 
        WHEN SUM(impressions) > 0 THEN SUM(clicks)::DOUBLE PRECISION / SUM(impressions)::DOUBLE PRECISION
        ELSE 0
    END as calculated_ctr,
    CASE 
        WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions)
        ELSE 0
    END as avg_position,
    COUNT(*) as query_count,
    MAX(ingested_at) as last_updated
FROM gsc_search_analytics
GROUP BY site_url, date, page_normalized;

-- Index on materialized view
CREATE UNIQUE INDEX idx_gsc_url_daily_unique ON gsc_url_daily(site_url, date, page_normalized);
CREATE INDEX idx_gsc_url_daily_site_date ON gsc_url_daily(site_url, date);

-- Import jobs tracking table
CREATE TABLE import_jobs (
    id SERIAL PRIMARY KEY,
    site_url VARCHAR(500) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    dimensions TEXT[] NOT NULL,
    search_type VARCHAR(20) NOT NULL DEFAULT 'web',
    data_state VARCHAR(10) NOT NULL DEFAULT 'all',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    rows_imported INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_import_jobs_status ON import_jobs(status);
CREATE INDEX idx_import_jobs_site_url ON import_jobs(site_url);

-- URL normalization rules per property (for future extensibility)
CREATE TABLE url_normalization_rules (
    id SERIAL PRIMARY KEY,
    site_url VARCHAR(500) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    rule_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (site_url) REFERENCES gsc_properties(site_url) ON DELETE CASCADE
);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_gsc_url_daily()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY gsc_url_daily;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_oauth_accounts_updated_at 
    BEFORE UPDATE ON oauth_google_accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gsc_properties_updated_at 
    BEFORE UPDATE ON gsc_properties 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();