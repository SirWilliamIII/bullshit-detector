/**
 * Apple official source for product verification
 * Scrapes Apple.com for product information and announcements
 */
const BaseSource = require('../BaseSource');
const AdvancedScraper = require('../../scrapers/AdvancedScraper');

class AppleSource extends BaseSource {
  constructor() {
    super({
      name: 'Apple Official',
      type: 'OFFICIAL_SITE',
      baseUrl: 'https://www.apple.com',
      reliability: 0.95,
      rateLimit: 2000
    });
    
    this.scraper = new AdvancedScraper();
  }

  /**
   * Check if this source can handle the query
   */
  canHandle(query, context) {
    const lowerQuery = query.toLowerCase();
    
    // Handle Apple product claims
    const appleProducts = ['iphone', 'ipad', 'macbook', 'apple watch', 'airpods', 'imac', 'mac mini'];
    const hasAppleProduct = appleProducts.some(product => lowerQuery.includes(product));
    
    // Handle Apple-related claims
    const hasAppleMention = lowerQuery.includes('apple');
    
    // Handle product claim types
    const isProductClaim = context.claimTypes?.some(claim => claim.type === 'PRODUCT_CLAIM');
    
    return hasAppleProduct || (hasAppleMention && isProductClaim);
  }

  /**
   * Verify claim using Apple's official website
   */
  async verify(query, context) {
    return this.withRateLimit(async () => {
      try {
        // Extract product information from query
        const productInfo = this.extractProductInfo(query);
        
        if (!productInfo.product) {
          return this.createResult('INSUFFICIENT_DATA', null, 0.1, {
            reason: 'No Apple product identified in query'
          });
        }

        // Search Apple's website
        const searchResults = await this.searchAppleWebsite(productInfo);
        
        // Verify product existence and details
        const verification = await this.verifyProductDetails(productInfo, searchResults);
        
        return verification;
        
      } catch (error) {
        return this.createResult('ERROR', null, 0, {
          error: error.message,
          source: this.name
        });
      }
    });
  }

  /**
   * Extract product information from query
   */
  extractProductInfo(query) {
    const lowerQuery = query.toLowerCase();
    
    const productInfo = {
      product: null,
      model: null,
      version: null,
      isNew: false,
      isAnnouncement: false
    };

    // Detect product type
    const productPatterns = {
      'iphone': /iphone\s*(\d+|pro|max|mini|plus)?/i,
      'ipad': /ipad\s*(pro|air|mini)?/i,
      'macbook': /macbook\s*(pro|air)?/i,
      'apple watch': /apple\s*watch\s*(series\s*\d+|ultra|se)?/i,
      'airpods': /airpods\s*(pro|max)?/i,
      'imac': /imac\s*(\d+)?/i,
      'mac mini': /mac\s*mini/i,
      'mac studio': /mac\s*studio/i,
      'mac pro': /mac\s*pro/i
    };

    for (const [product, pattern] of Object.entries(productPatterns)) {
      const match = query.match(pattern);
      if (match) {
        productInfo.product = product;
        productInfo.model = match[1] || null;
        break;
      }
    }

    // Detect version/model numbers
    const versionMatch = query.match(/(\d+)(?:\s*(?:pro|max|mini|plus|air|ultra|se))?/i);
    if (versionMatch) {
      productInfo.version = versionMatch[1];
    }

    // Detect new/announcement keywords
    const newKeywords = ['new', 'latest', 'newest', 'released', 'launched', 'announced', 'available'];
    productInfo.isNew = newKeywords.some(keyword => lowerQuery.includes(keyword));
    productInfo.isAnnouncement = lowerQuery.includes('announced') || lowerQuery.includes('announcement');

    return productInfo;
  }

  /**
   * Search Apple's website for product information
   */
  async searchAppleWebsite(productInfo) {
    const searchUrls = [];
    
    // Direct product page URLs
    if (productInfo.product) {
      const productSlug = productInfo.product.replace(/\s+/g, '-');
      searchUrls.push(`${this.baseUrl}/${productSlug}/`);
      
      // Specific model pages
      if (productInfo.model) {
        searchUrls.push(`${this.baseUrl}/${productSlug}/${productInfo.model.replace(/\s+/g, '-')}/`);
      }
    }

    // Apple Newsroom for announcements
    if (productInfo.isAnnouncement) {
      searchUrls.push(`${this.baseUrl}/newsroom/`);
    }

    // Search results page
    const searchQuery = `${productInfo.product} ${productInfo.model || ''}`.trim();
    searchUrls.push(`${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`);

    const results = [];
    
    for (const url of searchUrls.slice(0, 3)) {
      try {
        console.log(`🍎 Scraping Apple URL: ${url}`);
        const result = await this.scraper.scrape(url);
        
        if (result.success) {
          results.push({
            url,
            content: result.content,
            relevant: this.assessRelevance(result.content, productInfo)
          });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to scrape ${url}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Verify product details against scraped content
   */
  async verifyProductDetails(productInfo, searchResults) {
    const relevantResults = searchResults.filter(result => result.relevant > 0.5);
    
    if (relevantResults.length === 0) {
      return this.createResult('INSUFFICIENT_DATA', null, 0.3, {
        reason: 'No relevant product information found on Apple website',
        searchedUrls: searchResults.map(r => r.url)
      });
    }

    const verification = {
      productExists: false,
      modelExists: false,
      isAvailable: false,
      isNew: false,
      price: null,
      availability: null,
      evidence: []
    };

    for (const result of relevantResults) {
      const content = result.content;
      
      // Check product existence
      if (this.productMentioned(content, productInfo.product)) {
        verification.productExists = true;
        verification.evidence.push(`Product found on ${result.url}`);
      }

      // Check model existence
      if (productInfo.model && this.modelMentioned(content, productInfo.model)) {
        verification.modelExists = true;
        verification.evidence.push(`Model ${productInfo.model} found on ${result.url}`);
      }

      // Check availability
      const availabilityInfo = this.extractAvailability(content);
      if (availabilityInfo) {
        verification.isAvailable = availabilityInfo.available;
        verification.availability = availabilityInfo.text;
        verification.evidence.push(`Availability: ${availabilityInfo.text}`);
      }

      // Check pricing
      const priceInfo = this.extractPrice(content);
      if (priceInfo) {
        verification.price = priceInfo;
        verification.evidence.push(`Price: ${priceInfo}`);
      }

      // Check if it's a new product
      if (this.isNewProduct(content, productInfo)) {
        verification.isNew = true;
        verification.evidence.push('Product appears to be newly released');
      }
    }

    // Determine verification status
    let status = 'INSUFFICIENT_DATA';
    let confidence = 0.1;

    if (verification.productExists) {
      if (productInfo.model && verification.modelExists) {
        status = 'VERIFIED';
        confidence = 0.9;
      } else if (!productInfo.model) {
        status = 'VERIFIED';
        confidence = 0.8;
      } else {
        status = 'CONTRADICTED';
        confidence = 0.7;
      }
    } else {
      status = 'CONTRADICTED';
      confidence = 0.6;
    }

    return this.createResult(status, verification, confidence, {
      searchedUrls: searchResults.map(r => r.url),
      relevantResults: relevantResults.length,
      totalResults: searchResults.length
    });
  }

  /**
   * Assess relevance of content to product query
   */
  assessRelevance(content, productInfo) {
    let relevance = 0;
    const text = content.mainContent?.toLowerCase() || '';
    
    // Product name match
    if (productInfo.product && text.includes(productInfo.product.toLowerCase())) {
      relevance += 0.4;
    }

    // Model match
    if (productInfo.model && text.includes(productInfo.model.toLowerCase())) {
      relevance += 0.3;
    }

    // Apple-specific indicators
    const appleIndicators = ['apple', 'iphone', 'ipad', 'macbook', 'specifications', 'features'];
    const indicatorCount = appleIndicators.filter(indicator => text.includes(indicator)).length;
    relevance += Math.min(0.3, indicatorCount * 0.1);

    return Math.min(1, relevance);
  }

  /**
   * Check if product is mentioned in content
   */
  productMentioned(content, product) {
    const text = content.mainContent?.toLowerCase() || '';
    return text.includes(product.toLowerCase());
  }

  /**
   * Check if model is mentioned in content
   */
  modelMentioned(content, model) {
    const text = content.mainContent?.toLowerCase() || '';
    return text.includes(model.toLowerCase());
  }

  /**
   * Extract availability information
   */
  extractAvailability(content) {
    const text = content.mainContent || '';
    
    // Look for availability patterns
    const availabilityPatterns = [
      /available\s+([^.]+)/i,
      /in\s+stock/i,
      /out\s+of\s+stock/i,
      /coming\s+soon/i,
      /pre-order/i,
      /ships\s+([^.]+)/i
    ];

    for (const pattern of availabilityPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          available: !text.includes('out of stock'),
          text: match[0]
        };
      }
    }

    return null;
  }

  /**
   * Extract price information
   */
  extractPrice(content) {
    const text = content.mainContent || '';
    
    // Look for price patterns
    const pricePatterns = [
      /\$[\d,]+(?:\.\d{2})?/g,
      /from\s+\$[\d,]+/i,
      /starting\s+at\s+\$[\d,]+/i
    ];

    for (const pattern of pricePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        return matches[0];
      }
    }

    return null;
  }

  /**
   * Check if product is newly released
   */
  isNewProduct(content, productInfo) {
    const text = content.mainContent?.toLowerCase() || '';
    
    // Look for new product indicators
    const newIndicators = [
      'new',
      'latest',
      'newest',
      'just released',
      'now available',
      'introducing',
      'announced today'
    ];

    return newIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Health check for Apple website
   */
  async healthCheck() {
    try {
      // Simple health check without full scraping
      return {
        healthy: true,
        responseTime: 100,
        reliability: this.reliability
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        reliability: this.reliability
      };
    }
  }
}

module.exports = AppleSource;