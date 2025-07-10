/**
 * Base MCP Server class
 * Provides common functionality for all Model Context Protocol servers
 */
class BaseMCPServer {
  constructor(config = {}) {
    this.name = config.name || 'Unknown MCP Server';
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.capabilities = config.capabilities || [];
    this.status = 'initialized';
    this.error = null;
    this.lastHealthCheck = null;
    this.requestCount = 0;
    this.errorCount = 0;
    this.averageResponseTime = 0;
    this.responseTimes = [];
  }

  /**
   * Initialize the MCP server - override in subclasses
   */
  async initialize() {
    console.log(`🔧 Initializing ${this.name}...`);
    this.status = 'healthy';
    return true;
  }

  /**
   * Execute a capability - must be implemented by subclasses
   */
  async execute(capability, parameters = {}) {
    throw new Error(`execute() method must be implemented by ${this.name}`);
  }

  /**
   * Health check - override in subclasses if needed
   */
  async healthCheck() {
    try {
      // Basic health check - can be overridden
      return {
        healthy: this.status === 'healthy',
        responseTime: this.averageResponseTime,
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute with error handling and metrics
   */
  async executeWithMetrics(capability, parameters, executionFunction) {
    const startTime = Date.now();
    this.requestCount++;

    try {
      console.log(`🎯 ${this.name}: Executing ${capability}`);
      
      const result = await executionFunction(capability, parameters);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, true);
      
      console.log(`✅ ${this.name}: ${capability} completed in ${responseTime}ms`);
      
      return {
        success: true,
        result,
        metadata: {
          server: this.name,
          capability,
          responseTime,
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, false);
      this.errorCount++;
      
      console.error(`❌ ${this.name}: ${capability} failed after ${responseTime}ms:`, error.message);
      
      throw new Error(`${this.name} ${capability} execution failed: ${error.message}`);
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(responseTime, success) {
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    // Calculate average response time
    this.averageResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    
    // Update status based on recent performance
    if (success && this.status !== 'healthy') {
      this.status = 'healthy';
      this.error = null;
    } else if (!success) {
      this.status = 'degraded';
    }
  }

  /**
   * Validate parameters against schema
   */
  validateParameters(parameters, schema) {
    const errors = [];
    
    for (const [key, rules] of Object.entries(schema)) {
      const value = parameters[key];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${key}`);
        continue;
      }
      
      // Skip validation if value is undefined and not required
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      if (rules.type && typeof value !== rules.type) {
        errors.push(`Parameter ${key} must be of type ${rules.type}`);
      }
      
      // String validation
      if (rules.type === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`Parameter ${key} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`Parameter ${key} must be at most ${rules.maxLength} characters`);
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`Parameter ${key} does not match required pattern`);
        }
      }
      
      // Number validation
      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Parameter ${key} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Parameter ${key} must be at most ${rules.max}`);
        }
      }
      
      // Array validation
      if (rules.type === 'object' && Array.isArray(value)) {
        if (rules.minItems && value.length < rules.minItems) {
          errors.push(`Parameter ${key} must have at least ${rules.minItems} items`);
        }
        if (rules.maxItems && value.length > rules.maxItems) {
          errors.push(`Parameter ${key} must have at most ${rules.maxItems} items`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`);
    }
    
    return true;
  }

  /**
   * Create standardized response
   */
  createResponse(success, data = null, error = null, metadata = {}) {
    return {
      success,
      data,
      error,
      metadata: {
        server: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }

  /**
   * Log with server prefix
   */
  log(level, message, ...args) {
    const prefix = `[${this.name}]`;
    switch (level) {
      case 'info':
        console.log(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
      default:
        console.log(prefix, message, ...args);
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      capabilities: this.capabilities,
      status: this.status,
      error: this.error,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      averageResponseTime: Math.round(this.averageResponseTime),
      lastHealthCheck: this.lastHealthCheck
    };
  }

  /**
   * Cleanup resources - override in subclasses if needed
   */
  async cleanup() {
    console.log(`🧹 Cleaning up ${this.name}...`);
    this.status = 'stopped';
  }

  /**
   * Test connection - basic connectivity test
   */
  async testConnection() {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      this.log('error', 'Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get capability schema - return schema for each capability
   */
  getCapabilitySchema(capability) {
    // Override in subclasses to provide parameter schemas
    return {};
  }

  /**
   * List all available capabilities with descriptions
   */
  listCapabilities() {
    return this.capabilities.map(capability => ({
      name: capability,
      schema: this.getCapabilitySchema(capability),
      description: this.getCapabilityDescription(capability)
    }));
  }

  /**
   * Get capability description - override in subclasses
   */
  getCapabilityDescription(capability) {
    return `Execute ${capability} capability`;
  }
}

module.exports = BaseMCPServer;