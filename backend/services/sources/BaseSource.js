/**
 * Base class for all information sources
 * Provides common functionality for rate limiting, caching, and error handling
 */
class BaseSource {
  constructor(config = {}) {
    this.name = config.name || 'Unknown Source';
    this.type = config.type || 'GENERIC';
    this.baseUrl = config.baseUrl || '';
    this.rateLimit = config.rateLimit || 1000; // ms between requests
    this.timeout = config.timeout || 15000; // 15 seconds
    this.reliability = config.reliability || 0.5; // 0-1 scale
    this.enabled = config.enabled !== false;
    this.lastRequest = 0;
    this.requestCount = 0;
    this.errorCount = 0;
  }

  /**
   * Abstract method - must be implemented by subclasses
   */
  async verify(query, context) {
    throw new Error('verify() method must be implemented by subclass');
  }

  /**
   * Check if source can handle this type of query
   */
  canHandle(query, context) {
    return true; // Base implementation accepts all queries
  }

  /**
   * Rate limiting wrapper
   */
  async withRateLimit(fn) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.rateLimit) {
      const delay = this.rateLimit - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequest = Date.now();
    this.requestCount++;
    
    try {
      const result = await fn();
      return result;
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }

  /**
   * Standardized result format
   */
  createResult(status, data, confidence = 0.5, metadata = {}) {
    return {
      source: this.name,
      type: this.type,
      status, // 'VERIFIED', 'CONTRADICTED', 'INSUFFICIENT_DATA', 'ERROR'
      confidence,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        requestCount: this.requestCount,
        errorCount: this.errorCount
      }
    };
  }

  /**
   * Health check for the source
   */
  async healthCheck() {
    try {
      const testResult = await this.verify('test query', { type: 'TEST' });
      return {
        healthy: true,
        responseTime: Date.now() - this.lastRequest,
        reliability: this.reliability,
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        reliability: this.reliability,
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0
      };
    }
  }

  /**
   * Update reliability score based on performance
   */
  updateReliability(success, responseTime) {
    const performanceScore = Math.min(1, Math.max(0, (10000 - responseTime) / 10000));
    const successScore = success ? 1 : 0;
    
    // Weighted moving average
    this.reliability = (this.reliability * 0.9) + ((performanceScore * 0.7 + successScore * 0.3) * 0.1);
  }

  /**
   * Get source statistics
   */
  getStats() {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      reliability: this.reliability,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      lastRequest: this.lastRequest
    };
  }
}

module.exports = BaseSource;