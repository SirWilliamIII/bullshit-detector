/**
 * Dynamic source registry for managing multiple information sources
 * Handles source selection, load balancing, and failover
 */
class SourceRegistry {
  constructor() {
    this.sources = new Map();
    this.sourcesByType = new Map();
    this.initialized = false;
  }

  /**
   * Register a new source
   */
  register(source) {
    if (!source.name) {
      throw new Error('Source must have a name');
    }

    this.sources.set(source.name, source);
    
    // Group by type for efficient selection
    if (!this.sourcesByType.has(source.type)) {
      this.sourcesByType.set(source.type, []);
    }
    this.sourcesByType.get(source.type).push(source);

    console.log(`✅ Registered source: ${source.name} (${source.type})`);
  }

  /**
   * Initialize all sources
   */
  async initialize() {
    console.log('🔄 Initializing source registry...');
    
    const healthChecks = Array.from(this.sources.values()).map(async (source) => {
      try {
        const health = await source.healthCheck();
        if (!health.healthy) {
          console.warn(`⚠️  Source ${source.name} failed health check: ${health.error}`);
          source.enabled = false;
        }
        return { source: source.name, health };
      } catch (error) {
        console.error(`❌ Source ${source.name} initialization failed:`, error.message);
        source.enabled = false;
        return { source: source.name, error: error.message };
      }
    });

    const results = await Promise.allSettled(healthChecks);
    const healthy = results.filter(r => r.status === 'fulfilled' && r.value.health?.healthy).length;
    
    console.log(`✅ Source registry initialized: ${healthy}/${this.sources.size} sources healthy`);
    this.initialized = true;
    
    return results;
  }

  /**
   * Get sources that can handle a specific query
   */
  getSourcesForQuery(query, context) {
    const eligibleSources = [];
    
    for (const source of this.sources.values()) {
      if (source.enabled && source.canHandle(query, context)) {
        eligibleSources.push(source);
      }
    }

    // Sort by reliability (descending)
    return eligibleSources.sort((a, b) => b.reliability - a.reliability);
  }

  /**
   * Get sources by type
   */
  getSourcesByType(type) {
    return this.sourcesByType.get(type) || [];
  }

  /**
   * Get all enabled sources
   */
  getEnabledSources() {
    return Array.from(this.sources.values()).filter(source => source.enabled);
  }

  /**
   * Get source by name
   */
  getSource(name) {
    return this.sources.get(name);
  }

  /**
   * Select best sources for verification
   */
  selectSourcesForVerification(query, context, maxSources = 3) {
    const eligibleSources = this.getSourcesForQuery(query, context);
    
    if (eligibleSources.length === 0) {
      console.warn('⚠️  No eligible sources found for query:', query);
      return [];
    }

    // Strategy: Mix of high reliability and diverse types
    const selectedSources = [];
    const typesSeen = new Set();
    
    // First pass: Select one source per type, prioritizing reliability
    for (const source of eligibleSources) {
      if (!typesSeen.has(source.type) && selectedSources.length < maxSources) {
        selectedSources.push(source);
        typesSeen.add(source.type);
      }
    }
    
    // Second pass: Fill remaining slots with highest reliability
    for (const source of eligibleSources) {
      if (!selectedSources.includes(source) && selectedSources.length < maxSources) {
        selectedSources.push(source);
      }
    }

    console.log(`🎯 Selected ${selectedSources.length} sources for verification:`, 
      selectedSources.map(s => `${s.name} (${s.type}, reliability: ${s.reliability.toFixed(2)})`));
    
    return selectedSources;
  }

  /**
   * Execute verification across multiple sources
   */
  async verify(query, context, options = {}) {
    const maxSources = options.maxSources || 3;
    const timeout = options.timeout || 30000;
    
    if (!this.initialized) {
      await this.initialize();
    }

    const sources = this.selectSourcesForVerification(query, context, maxSources);
    
    if (sources.length === 0) {
      return {
        success: false,
        error: 'No eligible sources available',
        results: []
      };
    }

    console.log(`🔍 Starting verification with ${sources.length} sources...`);
    
    const verificationPromises = sources.map(async (source) => {
      const startTime = Date.now();
      
      try {
        const result = await Promise.race([
          source.verify(query, context),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Source timeout')), timeout)
          )
        ]);
        
        const responseTime = Date.now() - startTime;
        source.updateReliability(true, responseTime);
        
        return result;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        source.updateReliability(false, responseTime);
        
        console.error(`❌ Source ${source.name} failed:`, error.message);
        return source.createResult('ERROR', null, 0, { error: error.message });
      }
    });

    const results = await Promise.allSettled(verificationPromises);
    const verificationResults = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
    
    console.log(`✅ Verification complete: ${verificationResults.length} results`);
    
    return {
      success: verificationResults.length > 0,
      results: verificationResults,
      summary: this.summarizeResults(verificationResults)
    };
  }

  /**
   * Summarize verification results
   */
  summarizeResults(results) {
    if (results.length === 0) {
      return { verdict: 'INSUFFICIENT_DATA', confidence: 0 };
    }

    const statusCounts = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});

    // Calculate weighted confidence
    const totalWeight = results.reduce((sum, r) => sum + r.confidence * r.source.reliability, 0);
    const totalReliability = results.reduce((sum, r) => sum + r.source.reliability, 0);
    const weightedConfidence = totalReliability > 0 ? totalWeight / totalReliability : 0;

    // Determine verdict based on consensus
    const verified = statusCounts.VERIFIED || 0;
    const contradicted = statusCounts.CONTRADICTED || 0;
    const insufficient = statusCounts.INSUFFICIENT_DATA || 0;
    
    let verdict;
    if (verified > contradicted && verified > insufficient) {
      verdict = 'VERIFIED';
    } else if (contradicted > verified && contradicted > insufficient) {
      verdict = 'CONTRADICTED';
    } else {
      verdict = 'INSUFFICIENT_DATA';
    }

    return {
      verdict,
      confidence: Math.min(1, Math.max(0, weightedConfidence)),
      consensus: {
        verified,
        contradicted,
        insufficient,
        total: results.length
      }
    };
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const sources = Array.from(this.sources.values());
    const enabled = sources.filter(s => s.enabled).length;
    const avgReliability = sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length;
    const totalRequests = sources.reduce((sum, s) => sum + s.requestCount, 0);
    const totalErrors = sources.reduce((sum, s) => sum + s.errorCount, 0);

    return {
      totalSources: sources.length,
      enabledSources: enabled,
      averageReliability: avgReliability,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      sourcesByType: Object.fromEntries(this.sourcesByType.entries()),
      initialized: this.initialized
    };
  }
}

module.exports = SourceRegistry;