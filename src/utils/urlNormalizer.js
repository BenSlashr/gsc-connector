const { URL } = require('url');

class URLNormalizer {
  constructor() {
    this.trackingParams = new Set([
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'mc_cid', 'mc_eid', '_ga', 'pk_source', 'pk_medium',
      'pk_campaign', 'pk_kwd', 'pk_content', 'msclkid', 'igshid', 'ref',
      'referrer', 'src', 'source', 'campaign_id', 'ad_id', 'adgroup_id'
    ]);

    this.keepParams = new Set([]);
  }

  normalize(urlString, options = {}) {
    try {
      if (!urlString || typeof urlString !== 'string') {
        return urlString;
      }

      const url = new URL(urlString);
      
      const normalizedHost = this.normalizeHost(url.host, options);
      const normalizedPathname = this.normalizePath(url.pathname, options);
      const normalizedSearch = this.normalizeQueryParams(url.searchParams, options);
      
      let normalized = `${url.protocol}//${normalizedHost}${normalizedPathname}`;
      
      if (normalizedSearch) {
        normalized += `?${normalizedSearch}`;
      }
      
      if (url.hash && options.keepFragment) {
        normalized += url.hash;
      }

      return normalized;
    } catch (error) {
      console.error('URL normalization failed:', error.message, 'for URL:', urlString);
      return urlString;
    }
  }

  normalizeHost(host, options = {}) {
    const lowerHost = host.toLowerCase();
    
    if (options.forceWww) {
      return lowerHost.startsWith('www.') ? lowerHost : `www.${lowerHost}`;
    }
    
    if (options.removeWww) {
      return lowerHost.startsWith('www.') ? lowerHost.substring(4) : lowerHost;
    }
    
    return lowerHost;
  }

  normalizePath(pathname, options = {}) {
    if (!pathname || pathname === '/') {
      return '/';
    }

    let normalized = pathname;
    
    normalized = decodeURIComponent(normalized).replace(/\/+/g, '/');
    
    if (options.forceTrailingSlash && !normalized.endsWith('/')) {
      if (!this.isFileExtension(normalized)) {
        normalized += '/';
      }
    } else if (options.removeTrailingSlash && normalized.endsWith('/') && normalized !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  normalizeQueryParams(searchParams, options = {}) {
    const params = new URLSearchParams();
    const keepParams = options.keepParams ? new Set(options.keepParams) : this.keepParams;
    
    for (const [key, value] of searchParams) {
      const lowerKey = key.toLowerCase();
      
      if (!this.trackingParams.has(lowerKey) || keepParams.has(lowerKey)) {
        params.append(key, value);
      }
    }

    params.sort();
    return params.toString();
  }

  isFileExtension(path) {
    const extensions = /\.(html?|php|asp|jsp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|xml|json|css|js|jpg|jpeg|png|gif|svg|ico|zip|rar|tar|gz)$/i;
    return extensions.test(path);
  }

  setKeepParams(siteUrl, params) {
    this.keepParams = new Set(params);
  }

  addTrackingParam(param) {
    this.trackingParams.add(param.toLowerCase());
  }

  removeTrackingParam(param) {
    this.trackingParams.delete(param.toLowerCase());
  }

  normalizeForSite(urlString, siteUrl) {
    const options = this.getSiteOptions(siteUrl);
    return this.normalize(urlString, options);
  }

  getSiteOptions(siteUrl) {
    const options = {
      keepFragment: false,
      removeTrailingSlash: true
    };

    try {
      const siteURL = new URL(siteUrl);
      
      if (siteURL.hostname.startsWith('www.')) {
        options.forceWww = true;
      } else {
        options.removeWww = true;
      }

      if (siteURL.protocol === 'https:') {
        options.forceHttps = true;
      }
    } catch (error) {
      console.error('Failed to parse site URL for options:', siteUrl);
    }

    return options;
  }

  batchNormalize(urls, siteUrl = null) {
    if (!Array.isArray(urls)) {
      return [];
    }

    const options = siteUrl ? this.getSiteOptions(siteUrl) : {};
    
    return urls.map(url => ({
      original: url,
      normalized: this.normalize(url, options)
    }));
  }
}

const urlNormalizer = new URLNormalizer();

function normalizeUrl(url, siteUrl = null) {
  return siteUrl ? urlNormalizer.normalizeForSite(url, siteUrl) : urlNormalizer.normalize(url);
}

function batchNormalizeUrls(urls, siteUrl = null) {
  return urlNormalizer.batchNormalize(urls, siteUrl);
}

module.exports = {
  URLNormalizer,
  normalizeUrl,
  batchNormalizeUrls,
  urlNormalizer
};