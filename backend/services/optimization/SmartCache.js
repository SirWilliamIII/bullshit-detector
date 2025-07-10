/**
 * Smart Caching System for MCP Operations
 * Provides intelligent caching with TTL, LRU eviction, and cache warming
 */
const { EventEmitter } = require('events');
const crypto = require('crypto');

class SmartCache extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize || 1000; // Maximum number of cached items
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes default TTL
    this.cache = new Map();
    this.accessTimes = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
    this.cleanupInterval = null;
    
    // Cache warming configuration
    this.warmingEnabled = options.warmingEnabled !== false;
    this.warmingInterval = options.warmingInterval || 600000; // 10 minutes
    this.warmingTargets = new Map(); // capability -> parameters for warming
    
    this.startCleanupProcess();
    if (this.warmingEnabled) {
      this.startWarmingProcess();
    }
    
    console.log(`🧠 Smart Cache initialized (max: ${this.maxSize}, TTL: ${this.defaultTTL}ms)`);
  }

  /**
   * Generate cache key from capability and parameters
   */
  generateKey(capability, parameters = {}) {
    const normalizedParams = this.normalizeParameters(parameters);
    const keyData = JSON.stringify({ capability, params: normalizedParams });
    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  /**
   * Normalize parameters for consistent caching
   */
  normalizeParameters(parameters) {
    if (!parameters || typeof parameters !== 'object') {
      return parameters;
    }
    
    // Sort keys for consistent hashing
    const sorted = {};
    Object.keys(parameters)
      .filter(key => parameters[key] !== undefined) // Remove undefined values
      .sort()
      .forEach(key => {
        let value = parameters[key];
        
        // Normalize strings (trim, lowercase for non-sensitive data)
        if (typeof value === 'string' && !this.isSensitiveParameter(key)) {
          value = value.trim().toLowerCase();
        }
        
        // Recursively normalize objects
        if (typeof value === 'object' && value !== null) {
          value = this.normalizeParameters(value);
        }
        
        sorted[key] = value;
      });
    
    return sorted;
  }

  /**
   * Check if parameter should not be normalized (case-sensitive)
   */
  isSensitiveParameter(key) {
    const sensitiveKeys = ['token', 'key', 'password', 'secret', 'auth', 'signature'];
    return sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive));
  }

  /**
   * Get cached result if available and valid
   */
  async get(capability, parameters = {}) {
    const key = this.generateKey(capability, parameters);
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.missCount++;
      this.emit('cache_miss', { capability, key });
      return null;
    }
    
    // Check if expired
    if (this.isExpired(cached)) {
      this.cache.delete(key);
      this.accessTimes.delete(key);
      this.missCount++;
      this.emit('cache_expired', { capability, key });
      return null;
    }
    
    // Update access time for LRU
    this.accessTimes.set(key, Date.now());
    this.hitCount++;
    
    console.log(`💨 Cache HIT for ${capability} (key: ${key.substr(0, 8)}...)`);
    this.emit('cache_hit', { capability, key });
    
    return {
      ...cached.data,
      cached: true,
      cacheMetadata: {
        cachedAt: cached.timestamp,
        expiresAt: cached.expiresAt,
        age: Date.now() - cached.timestamp
      }
    };
  }

  /**
   * Store result in cache with intelligent TTL
   */
  async set(capability, parameters = {}, result, customTTL = null) {
    if (!result || this.shouldNotCache(capability, result)) {
      return false;
    }
    
    const key = this.generateKey(capability, parameters);
    const ttl = customTTL || this.calculateTTL(capability, result);
    const timestamp = Date.now();
    
    // Ensure we don't exceed cache size
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    const cacheEntry = {
      data: this.sanitizeForCache(result),
      timestamp,
      expiresAt: timestamp + ttl,
      ttl,
      capability,
      accessCount: 0
    };
    
    this.cache.set(key, cacheEntry);
    this.accessTimes.set(key, timestamp);
    
    console.log(`💾 Cached ${capability} (TTL: ${ttl}ms, key: ${key.substr(0, 8)}...)`);
    this.emit('cache_set', { capability, key, ttl });
    
    return true;
  }

  /**
   * Calculate dynamic TTL based on capability and result characteristics
   */
  calculateTTL(capability, result) {
    let ttl = this.defaultTTL;
    
    // Capability-specific TTL rules
    switch (capability) {
      case 'web_search':
      case 'real_time_data':
        ttl = 30000; // 30 seconds for real-time data
        break;
      case 'domain_whois':
        ttl = 3600000; // 1 hour for domain info
        break;
      case 'file_read':
        ttl = 600000; // 10 minutes for file operations
        break;
      case 'database_query':
        ttl = 180000; // 3 minutes for database queries
        break;
      default:
        ttl = this.defaultTTL;
    }
    
    // Result-based adjustments
    if (result) {
      // Reduce TTL for error results
      if (result.error || result.success === false) {
        ttl = Math.min(ttl, 60000); // Max 1 minute for errors
      }
      
      // Increase TTL for stable/verified data
      if (result.verified === true || result.confidence > 0.9) {
        ttl *= 2;
      }
      
      // Reduce TTL for low-confidence results
      if (result.confidence && result.confidence < 0.5) {
        ttl *= 0.5;
      }
    }
    
    return Math.min(ttl, 7200000); // Max 2 hours
  }

  /**
   * Determine if result should not be cached
   */
  shouldNotCache(capability, result) {
    // Don't cache errors (except for a short time)
    if (result.error && !result.temporary) {
      return false;
    }
    
    // Don't cache empty or invalid results
    if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
      return true;
    }
    
    // Don't cache sensitive operations
    const sensitiveCapabilities = ['auth', 'login', 'password', 'token'];
    if (sensitiveCapabilities.some(sensitive => capability.toLowerCase().includes(sensitive))) {
      return true;
    }
    
    return false;
  }

  /**
   * Sanitize result for safe caching (remove sensitive data)
   */
  sanitizeForCache(result) {
    if (!result || typeof result !== 'object') {
      return result;
    }
    
    const sanitized = { ...result };
    
    // Remove potentially sensitive fields
    const sensitiveFields = ['token', 'key', 'password', 'secret', 'auth', 'credentials'];
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        delete sanitized[field];
      }
    });
    
    // Limit size of cached data
    const maxSize = 1024 * 1024; // 1MB
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > maxSize) {
      console.warn(`⚠️ Result too large for cache (${serialized.length} bytes), truncating`);
      // Keep only essential fields for large results
      return {
        verdict: sanitized.verdict,
        confidence: sanitized.confidence,
        summary: sanitized.summary,
        truncated: true,
        originalSize: serialized.length
      };
    }
    
    return sanitized;
  }

  /**
   * Check if cache entry is expired
   */
  isExpired(cacheEntry) {
    return Date.now() > cacheEntry.expiresAt;
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, time] of this.accessTimes) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      const cached = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.accessTimes.delete(oldestKey);
      this.evictionCount++;
      
      console.log(`🗑️ Evicted LRU entry: ${cached?.capability || 'unknown'}`);
      this.emit('cache_evicted', { key: oldestKey, reason: 'LRU' });
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern) {
    let invalidatedCount = 0;
    
    for (const [key, cached] of this.cache) {
      if (this.matchesPattern(cached.capability, pattern)) {
        this.cache.delete(key);
        this.accessTimes.delete(key);
        invalidatedCount++;
      }
    }
    
    console.log(`🧹 Invalidated ${invalidatedCount} cache entries matching: ${pattern}`);
    this.emit('cache_invalidated', { pattern, count: invalidatedCount });
    
    return invalidatedCount;
  }

  /**
   * Check if capability matches invalidation pattern
   */
  matchesPattern(capability, pattern) {
    if (typeof pattern === 'string') {
      return capability.includes(pattern);
    }
    if (pattern instanceof RegExp) {
      return pattern.test(capability);
    }
    return false;
  }

  /**
   * Warm cache with frequently used operations
   */
  async warmCache(mcpOrchestrator) {
    if (!this.warmingEnabled || !mcpOrchestrator) {
      return;
    }
    
    console.log('🔥 Starting cache warming...');
    let warmedCount = 0;
    
    for (const [capability, parametersList] of this.warmingTargets) {
      for (const parameters of parametersList) {
        try {
          const key = this.generateKey(capability, parameters);
          
          // Skip if already cached and not expired
          if (this.cache.has(key) && !this.isExpired(this.cache.get(key))) {
            continue;
          }
          
          console.log(`🔥 Warming cache for ${capability}`);
          const result = await mcpOrchestrator.executeCapability(capability, parameters);
          
          if (result && result.results) {
            await this.set(capability, parameters, result);
            warmedCount++;
          }
          
          // Small delay to avoid overwhelming servers
          await this.delay(100);
          
        } catch (error) {
          console.warn(`⚠️ Cache warming failed for ${capability}:`, error.message);
        }
      }
    }
    
    console.log(`🔥 Cache warming completed: ${warmedCount} entries warmed`);
    this.emit('cache_warmed', { count: warmedCount });
  }

  /**
   * Add warming target
   */
  addWarmingTarget(capability, parameters) {
    if (!this.warmingTargets.has(capability)) {
      this.warmingTargets.set(capability, []);
    }
    this.warmingTargets.get(capability).push(parameters);
  }

  /**
   * Start cleanup process for expired entries
   */
  startCleanupProcess() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean every minute
  }

  /**
   * Start cache warming process
   */
  startWarmingProcess() {
    setInterval(() => {
      if (this.warmingEnabled) {
        // Warming will be triggered externally with MCP orchestrator
        this.emit('warming_due');
      }
    }, this.warmingInterval);
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    let cleanedCount = 0;
    const now = Date.now();
    
    for (const [key, cached] of this.cache) {
      if (this.isExpired(cached)) {
        this.cache.delete(key);
        this.accessTimes.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
      this.emit('cache_cleaned', { count: cleanedCount });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      missRate: totalRequests > 0 ? this.missCount / totalRequests : 0,
      memoryUsage: this.estimateMemoryUsage(),
      warmingTargets: this.warmingTargets.size
    };
  }

  /**
   * Estimate memory usage
   */
  estimateMemoryUsage() {
    let totalSize = 0;
    for (const cached of this.cache.values()) {
      totalSize += JSON.stringify(cached).length;
    }
    return {
      estimated: totalSize,
      formatted: this.formatBytes(totalSize)
    };
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessTimes.clear();
    console.log(`🧹 Cleared all ${size} cache entries`);
    this.emit('cache_cleared', { count: size });
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown cache system
   */
  shutdown() {
    console.log('🛑 Shutting down smart cache...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Optional: persist cache to disk for faster startup
    this.clear();
    
    console.log('✅ Smart cache shut down gracefully');
  }
}

module.exports = SmartCache;