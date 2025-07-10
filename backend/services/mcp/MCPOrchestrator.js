/**
 * MCP Orchestrator - Central hub for managing Model Context Protocol servers
 * Provides dynamic discovery, routing, and management of MCP capabilities
 */
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;

class MCPOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mcpServers = new Map();
    this.capabilities = new Map();
    this.initialized = false;
    this.healthCheckInterval = null;
    
    // Optimization components
    this.parallelProcessor = null;
    this.smartCache = null;
    this.optimizationEnabled = options.optimizationEnabled !== false;
    
    if (this.optimizationEnabled) {
      this.initializeOptimization(options);
    }
  }

  /**
   * Initialize optimization components
   */
  async initializeOptimization(options = {}) {
    try {
      const ParallelProcessor = require('../optimization/ParallelProcessor');
      const SmartCache = require('../optimization/SmartCache');
      
      this.parallelProcessor = new ParallelProcessor({
        maxConcurrentTasks: options.maxConcurrentTasks || 6,
        taskTimeout: options.taskTimeout || 25000
      });
      
      this.smartCache = new SmartCache({
        maxSize: options.cacheSize || 500,
        defaultTTL: options.cacheTTL || 300000, // 5 minutes
        warmingEnabled: options.cacheWarmingEnabled !== false
      });
      
      // Setup cache warming when it's due
      this.smartCache.on('warming_due', () => {
        this.warmCache();
      });
      
      console.log('⚡ MCP optimization components initialized');
      
    } catch (error) {
      console.warn('⚠️ Failed to initialize optimization components:', error.message);
      this.optimizationEnabled = false;
    }
  }

  /**
   * Initialize the MCP orchestrator
   */
  async initialize() {
    if (this.initialized) return;

    console.log('🔧 Initializing MCP Orchestrator...');
    
    try {
      // Load and register MCP servers
      await this.discoverMCPServers();
      
      // Initialize all servers
      await this.initializeServers();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.initialized = true;
      console.log(`✅ MCP Orchestrator initialized with ${this.mcpServers.size} servers`);
      
      this.emit('initialized', {
        serverCount: this.mcpServers.size,
        capabilities: Array.from(this.capabilities.keys())
      });
      
    } catch (error) {
      console.error('❌ MCP Orchestrator initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Discover and load available MCP servers
   */
  async discoverMCPServers() {
    const mcpPath = path.join(__dirname, 'servers');
    
    try {
      await fs.access(mcpPath);
      const serverFiles = await fs.readdir(mcpPath);
      
      for (const file of serverFiles) {
        if (file.endsWith('MCP.js')) {
          try {
            const ServerClass = require(path.join(mcpPath, file));
            const serverInstance = new ServerClass();
            
            this.registerMCPServer(serverInstance);
            console.log(`📦 Discovered MCP server: ${serverInstance.name}`);
            
          } catch (error) {
            console.warn(`⚠️ Failed to load MCP server ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log('📁 MCP servers directory not found, creating...');
      await fs.mkdir(mcpPath, { recursive: true });
    }
  }

  /**
   * Register an MCP server
   */
  registerMCPServer(server) {
    if (!server.name || !server.capabilities) {
      throw new Error('MCP server must have name and capabilities');
    }

    this.mcpServers.set(server.name, server);
    
    // Register capabilities
    for (const capability of server.capabilities) {
      if (!this.capabilities.has(capability)) {
        this.capabilities.set(capability, []);
      }
      this.capabilities.get(capability).push(server.name);
    }

    console.log(`✅ Registered MCP server: ${server.name} with capabilities: ${server.capabilities.join(', ')}`);
  }

  /**
   * Initialize all registered servers
   */
  async initializeServers() {
    const initPromises = Array.from(this.mcpServers.values()).map(async (server) => {
      try {
        if (server.initialize) {
          await server.initialize();
        }
        server.status = 'healthy';
        return { server: server.name, status: 'success' };
      } catch (error) {
        console.error(`❌ Failed to initialize ${server.name}: ${error.message}`);
        server.status = 'error';
        server.error = error.message;
        return { server: server.name, status: 'error', error: error.message };
      }
    });

    const results = await Promise.allSettled(initPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
    
    console.log(`🚀 Initialized ${successful}/${this.mcpServers.size} MCP servers`);
  }

  /**
   * Execute a capability across relevant MCP servers with optimization
   */
  async executeCapability(capability, parameters = {}, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      useCache = true,
      useParallelProcessing = true,
      timeout = 30000,
      retryFailures = true
    } = options;

    // Check cache first if enabled
    if (useCache && this.smartCache) {
      const cached = await this.smartCache.get(capability, parameters);
      if (cached) {
        return cached;
      }
    }

    const relevantServers = this.capabilities.get(capability);
    if (!relevantServers || relevantServers.length === 0) {
      throw new Error(`No MCP servers found for capability: ${capability}`);
    }

    console.log(`🎯 Executing ${capability} across ${relevantServers.length} server(s)`);

    let results;
    
    if (useParallelProcessing && this.parallelProcessor && relevantServers.length > 1) {
      // Use parallel processing for multiple servers
      const tasks = relevantServers
        .filter(serverName => {
          const server = this.mcpServers.get(serverName);
          return server && server.status === 'healthy';
        })
        .map(serverName => ({
          id: `${capability}_${serverName}_${Date.now()}`,
          capability,
          parameters,
          server: serverName,
          mcpServer: this.mcpServers.get(serverName),
          estimatedTime: this.estimateTaskTime(capability, serverName),
          priority: this.calculateServerPriority(serverName)
        }));

      if (tasks.length === 0) {
        throw new Error('No healthy servers available for capability');
      }

      const parallelResult = await this.parallelProcessor.executeParallel(tasks, {
        timeout,
        retryFailures
      });

      results = parallelResult.results.map(result => ({
        server: result.server,
        success: result.success,
        result: result.result,
        error: result.error,
        responseTime: result.responseTime,
        timestamp: result.timestamp
      }));

    } else {
      // Sequential execution for single server or when parallel processing is disabled
      results = [];
      
      for (const serverName of relevantServers) {
        const server = this.mcpServers.get(serverName);
        
        if (server.status !== 'healthy') {
          console.warn(`⚠️ Skipping unhealthy server: ${serverName}`);
          continue;
        }

        try {
          const startTime = Date.now();
          const result = await server.execute(capability, parameters);
          const responseTime = Date.now() - startTime;
          
          results.push({
            server: serverName,
            success: true,
            result,
            responseTime,
            timestamp: new Date().toISOString()
          });
          
          console.log(`✅ ${serverName} completed ${capability} in ${responseTime}ms`);
          
        } catch (error) {
          console.error(`❌ ${serverName} failed ${capability}: ${error.message}`);
          results.push({
            server: serverName,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    const executionResult = {
      capability,
      results,
      summary: {
        total: relevantServers.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      cached: false,
      timestamp: new Date().toISOString()
    };

    // Cache the result if enabled and successful
    if (useCache && this.smartCache && results.some(r => r.success)) {
      await this.smartCache.set(capability, parameters, executionResult);
    }

    return executionResult;
  }

  /**
   * Get server by capability
   */
  getServersByCapability(capability) {
    const serverNames = this.capabilities.get(capability) || [];
    return serverNames.map(name => this.mcpServers.get(name)).filter(Boolean);
  }

  /**
   * Get specific server
   */
  getServer(name) {
    return this.mcpServers.get(name);
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 60000); // Check every minute
  }

  /**
   * Perform health checks on all servers
   */
  async performHealthChecks() {
    for (const [name, server] of this.mcpServers) {
      try {
        if (server.healthCheck) {
          const health = await server.healthCheck();
          server.status = health.healthy ? 'healthy' : 'unhealthy';
          server.lastHealthCheck = new Date().toISOString();
          
          if (!health.healthy) {
            console.warn(`⚠️ ${name} health check failed: ${health.error}`);
            this.emit('serverUnhealthy', { server: name, error: health.error });
          }
        }
      } catch (error) {
        server.status = 'error';
        server.error = error.message;
        console.error(`❌ Health check failed for ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    const servers = Array.from(this.mcpServers.values());
    const healthyServers = servers.filter(s => s.status === 'healthy').length;
    
    return {
      initialized: this.initialized,
      totalServers: servers.length,
      healthyServers,
      unhealthyServers: servers.length - healthyServers,
      capabilities: Object.fromEntries(this.capabilities),
      serverStats: servers.map(s => ({
        name: s.name,
        status: s.status,
        capabilities: s.capabilities,
        lastHealthCheck: s.lastHealthCheck,
        error: s.error
      }))
    };
  }

  /**
   * List available capabilities
   */
  listCapabilities() {
    return Array.from(this.capabilities.keys()).map(capability => ({
      capability,
      servers: this.capabilities.get(capability),
      serverCount: this.capabilities.get(capability).length
    }));
  }

  /**
   * Execute multiple capabilities in parallel
   */
  async executeMultiple(capabilities) {
    const promises = capabilities.map(({ capability, parameters }) => 
      this.executeCapability(capability, parameters)
    );
    
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => ({
      capability: capabilities[index].capability,
      status: result.status,
      result: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }

  /**
   * Smart capability routing based on context
   */
  async smartRoute(request) {
    const { intent, context, parameters } = request;
    
    // Analyze intent to determine best capabilities
    const capabilities = this.analyzeIntent(intent, context);
    
    if (capabilities.length === 0) {
      throw new Error('No suitable capabilities found for request');
    }
    
    // Execute capabilities in order of priority
    const results = [];
    for (const capability of capabilities) {
      try {
        const result = await this.executeCapability(capability, parameters);
        results.push(result);
        
        // Stop if we got a successful result
        if (result.summary.successful > 0) {
          break;
        }
      } catch (error) {
        console.warn(`⚠️ Smart routing: ${capability} failed, trying next...`);
      }
    }
    
    return {
      intent,
      capabilities,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze intent to determine appropriate capabilities
   */
  analyzeIntent(intent, context) {
    const intentLower = intent.toLowerCase();
    const capabilities = [];
    
    // File operations
    if (intentLower.includes('file') || intentLower.includes('read') || 
        intentLower.includes('write') || intentLower.includes('save')) {
      capabilities.push('file_operations');
    }
    
    // Database operations
    if (intentLower.includes('database') || intentLower.includes('query') || 
        intentLower.includes('sql') || intentLower.includes('data')) {
      capabilities.push('database_query');
    }
    
    // Web operations
    if (intentLower.includes('web') || intentLower.includes('scrape') || 
        intentLower.includes('browse') || intentLower.includes('automation')) {
      capabilities.push('web_automation');
    }
    
    // Code operations
    if (intentLower.includes('code') || intentLower.includes('github') || 
        intentLower.includes('repository') || intentLower.includes('commit')) {
      capabilities.push('code_management');
    }
    
    // Documentation
    if (intentLower.includes('document') || intentLower.includes('note') || 
        intentLower.includes('wiki') || intentLower.includes('knowledge')) {
      capabilities.push('knowledge_management');
    }
    
    // API operations
    if (intentLower.includes('api') || intentLower.includes('endpoint') || 
        intentLower.includes('request') || intentLower.includes('test')) {
      capabilities.push('api_operations');
    }
    
    return capabilities;
  }

  /**
   * Estimate task execution time for optimization
   */
  estimateTaskTime(capability, serverName) {
    const server = this.mcpServers.get(serverName);
    if (!server) return 5000; // Default 5 seconds
    
    // Use server's average response time if available
    if (server.averageResponseTime > 0) {
      return server.averageResponseTime * 1.2; // Add 20% buffer
    }
    
    // Capability-based estimates
    const estimates = {
      'web_search': 8000,
      'web_scraping': 12000,
      'database_query': 3000,
      'file_operations': 1000,
      'github_operations': 5000
    };
    
    return estimates[capability] || 5000;
  }

  /**
   * Calculate server priority for task routing
   */
  calculateServerPriority(serverName) {
    const server = this.mcpServers.get(serverName);
    if (!server) return 0;
    
    let priority = 5; // Base priority
    
    // Higher priority for faster servers
    if (server.averageResponseTime > 0) {
      priority += Math.max(0, 10 - (server.averageResponseTime / 1000));
    }
    
    // Higher priority for more reliable servers
    if (server.errorCount > 0 && server.requestCount > 0) {
      const errorRate = server.errorCount / server.requestCount;
      priority += Math.max(0, 5 - (errorRate * 10));
    }
    
    return priority;
  }

  /**
   * Warm cache with common operations
   */
  async warmCache() {
    if (!this.smartCache) return;
    
    try {
      await this.smartCache.warmCache(this);
    } catch (error) {
      console.warn('⚠️ Cache warming failed:', error.message);
    }
  }

  /**
   * Add cache warming targets
   */
  addCacheWarmingTarget(capability, parameters) {
    if (this.smartCache) {
      this.smartCache.addWarmingTarget(capability, parameters);
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    const stats = {
      optimizationEnabled: this.optimizationEnabled,
      parallelProcessor: null,
      smartCache: null
    };
    
    if (this.parallelProcessor) {
      stats.parallelProcessor = this.parallelProcessor.getPerformanceMetrics();
    }
    
    if (this.smartCache) {
      stats.smartCache = this.smartCache.getStats();
    }
    
    return stats;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up MCP Orchestrator...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Cleanup optimization components
    if (this.parallelProcessor) {
      await this.parallelProcessor.shutdown();
    }
    
    if (this.smartCache) {
      this.smartCache.shutdown();
    }
    
    // Cleanup all servers
    const cleanupPromises = Array.from(this.mcpServers.values()).map(async (server) => {
      try {
        if (server.cleanup) {
          await server.cleanup();
        }
      } catch (error) {
        console.warn(`⚠️ Error cleaning up ${server.name}: ${error.message}`);
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    
    this.mcpServers.clear();
    this.capabilities.clear();
    this.initialized = false;
    
    console.log('✅ MCP Orchestrator cleanup complete');
  }
}

module.exports = MCPOrchestrator;