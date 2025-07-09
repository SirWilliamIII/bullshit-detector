/**
 * Central verification engine that orchestrates multi-source validation
 * Combines context detection, source selection, and result aggregation
 */
const ContextDetector = require('../context/ContextDetector');
const SourceRegistry = require('../sources/SourceRegistry');
const AdvancedScraper = require('../scrapers/AdvancedScraper');

class VerificationEngine {
  constructor() {
    this.contextDetector = new ContextDetector();
    this.sourceRegistry = new SourceRegistry();
    this.scraper = new AdvancedScraper();
    this.cache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the verification engine
   */
  async initialize() {
    if (this.initialized) return;

    console.log('🔍 Initializing verification engine...');
    
    try {
      // Register built-in sources
      await this.registerBuiltInSources();
      
      // Initialize source registry
      await this.sourceRegistry.initialize();
      
      // Initialize scraper
      await this.scraper.initialize();
      
      this.initialized = true;
      console.log('✅ Verification engine initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize verification engine:', error.message);
      throw error;
    }
  }

  /**
   * Register built-in verification sources
   */
  async registerBuiltInSources() {
    // Import and register source implementations
    const AppleSource = require('../sources/implementations/AppleSource');
    const SearchSource = require('../sources/implementations/SearchSource');
    const NewsSource = require('../sources/implementations/NewsSource');
    const DomainAnalysisSource = require('../sources/implementations/DomainAnalysisSource');
    
    // Register sources
    this.sourceRegistry.register(new AppleSource());
    this.sourceRegistry.register(new SearchSource());
    this.sourceRegistry.register(new NewsSource());
    this.sourceRegistry.register(new DomainAnalysisSource());
    
    console.log('🔧 Built-in sources registered');
  }

  /**
   * Main verification method
   */
  async verify(text, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    try {
      // Step 1: Analyze context
      console.log('📊 Analyzing context...');
      const context = await this.contextDetector.detectContext(text);
      
      // Step 2: Check cache
      const cacheKey = this.generateCacheKey(text, context);
      if (this.cache.has(cacheKey) && !options.bypassCache) {
        console.log('💾 Using cached result');
        const cached = this.cache.get(cacheKey);
        return {
          ...cached,
          source: 'cache',
          responseTime: Date.now() - startTime
        };
      }

      // Step 3: Perform verification
      console.log('🔍 Starting multi-source verification...');
      const verificationResult = await this.performVerification(text, context, options);
      
      // Step 4: Process and cache result
      const finalResult = this.processVerificationResult(verificationResult, context, startTime);
      
      // Cache result with appropriate TTL
      const ttl = this.calculateCacheTTL(context);
      this.cacheResult(cacheKey, finalResult, ttl);
      
      return finalResult;
      
    } catch (error) {
      console.error('❌ Verification failed:', error.message);
      return {
        success: false,
        error: error.message,
        verdict: 'VERIFICATION_ERROR',
        confidence: 0,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Perform multi-source verification
   */
  async performVerification(text, context, options) {
    const maxSources = options.maxSources || 3;
    const timeout = options.timeout || 30000;
    
    // Select sources based on context
    const sources = this.sourceRegistry.selectSourcesForVerification(text, context, maxSources);
    
    if (sources.length === 0) {
      throw new Error('No suitable sources available for verification');
    }

    console.log(`🎯 Selected ${sources.length} sources for verification`);
    
    // Execute verification in parallel
    const verificationPromises = sources.map(source => this.verifyWithSource(source, text, context, timeout));
    
    // Wait for all verifications to complete
    const results = await Promise.allSettled(verificationPromises);
    
    // Process results
    const successfulResults = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);
    
    const failedResults = results
      .filter(result => result.status === 'rejected')
      .map(result => ({ error: result.reason.message }));
    
    return {
      successful: successfulResults,
      failed: failedResults,
      total: sources.length
    };
  }

  /**
   * Verify with a single source
   */
  async verifyWithSource(source, text, context, timeout) {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Verifying with ${source.name}...`);
      
      // Execute verification with timeout
      const result = await Promise.race([
        source.verify(text, context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Source timeout')), timeout)
        )
      ]);
      
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ ${source.name} completed in ${responseTime}ms: ${result.status}`);
      
      return {
        ...result,
        responseTime,
        source: source.name
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ ${source.name} failed after ${responseTime}ms:`, error.message);
      
      return {
        source: source.name,
        status: 'ERROR',
        error: error.message,
        confidence: 0,
        responseTime
      };
    }
  }

  /**
   * Process verification results into final verdict
   */
  processVerificationResult(verificationResult, context, startTime) {
    const { successful, failed, total } = verificationResult;
    
    // Calculate consensus
    const consensus = this.calculateConsensus(successful);
    
    // Determine final verdict
    const verdict = this.determineFinalVerdict(consensus, successful);
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(successful, consensus);
    
    // Generate explanation
    const explanation = this.generateExplanation(successful, consensus, context);
    
    return {
      success: true,
      verdict,
      confidence,
      consensus,
      explanation,
      context: {
        summary: this.contextDetector.summarizeContext(context),
        claimTypes: context.claimTypes,
        entities: context.entities,
        temporal: context.temporal
      },
      sources: {
        successful: successful.length,
        failed: failed.length,
        total: total,
        results: successful.map(r => ({
          source: r.source,
          status: r.status,
          confidence: r.confidence,
          responseTime: r.responseTime
        }))
      },
      metadata: {
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        cacheKey: this.generateCacheKey(context.text, context)
      }
    };
  }

  /**
   * Calculate consensus from multiple sources
   */
  calculateConsensus(results) {
    if (results.length === 0) {
      return { verdict: 'INSUFFICIENT_DATA', strength: 0 };
    }

    const statusCounts = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});

    const total = results.length;
    const verified = statusCounts.VERIFIED || 0;
    const contradicted = statusCounts.CONTRADICTED || 0;
    const insufficient = statusCounts.INSUFFICIENT_DATA || 0;

    // Determine consensus
    let verdict;
    let strength;

    if (verified > contradicted && verified > insufficient) {
      verdict = 'VERIFIED';
      strength = verified / total;
    } else if (contradicted > verified && contradicted > insufficient) {
      verdict = 'CONTRADICTED';
      strength = contradicted / total;
    } else {
      verdict = 'INSUFFICIENT_DATA';
      strength = Math.max(verified, contradicted, insufficient) / total;
    }

    return {
      verdict,
      strength,
      breakdown: {
        verified,
        contradicted,
        insufficient,
        total
      }
    };
  }

  /**
   * Determine final verdict
   */
  determineFinalVerdict(consensus, results) {
    // Strong consensus (>75%) - trust the consensus
    if (consensus.strength > 0.75) {
      return consensus.verdict;
    }

    // Moderate consensus (50-75%) - consider confidence scores
    if (consensus.strength > 0.5) {
      const highConfidenceResults = results.filter(r => r.confidence > 0.8);
      if (highConfidenceResults.length > 0) {
        return consensus.verdict;
      }
    }

    // Weak consensus or conflict - default to suspicious
    if (consensus.verdict === 'CONTRADICTED' || consensus.strength < 0.5) {
      return 'SUSPICIOUS';
    }

    return consensus.verdict;
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(results, consensus) {
    if (results.length === 0) return 0;

    // Base confidence on consensus strength
    let baseConfidence = consensus.strength;

    // Adjust based on individual source confidence
    const avgSourceConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    // Adjust based on source diversity
    const uniqueSources = new Set(results.map(r => r.source)).size;
    const diversityBonus = Math.min(0.2, uniqueSources * 0.1);

    // Final confidence calculation
    const finalConfidence = (baseConfidence * 0.6) + (avgSourceConfidence * 0.3) + diversityBonus;

    return Math.min(1, Math.max(0, finalConfidence));
  }

  /**
   * Generate human-readable explanation
   */
  generateExplanation(results, consensus, context) {
    const explanation = {
      summary: '',
      details: [],
      reasoning: []
    };

    // Generate summary
    const sourceCount = results.length;
    const verdictText = consensus.verdict.toLowerCase().replace('_', ' ');
    explanation.summary = `Based on analysis of ${sourceCount} source${sourceCount > 1 ? 's' : ''}, the claim appears to be ${verdictText}`;

    // Add source details
    results.forEach(result => {
      if (result.status === 'VERIFIED') {
        explanation.details.push(`✅ ${result.source}: Confirmed the claim`);
      } else if (result.status === 'CONTRADICTED') {
        explanation.details.push(`❌ ${result.source}: Contradicted the claim`);
      } else {
        explanation.details.push(`❓ ${result.source}: Insufficient data`);
      }
    });

    // Add reasoning
    if (consensus.verdict === 'VERIFIED') {
      explanation.reasoning.push('Multiple authoritative sources confirm the information');
    } else if (consensus.verdict === 'CONTRADICTED') {
      explanation.reasoning.push('Sources contradict or disprove the claim');
    } else {
      explanation.reasoning.push('Unable to find sufficient evidence to verify the claim');
    }

    // Add context-specific reasoning
    if (context.temporal.recency === 'HIGH') {
      explanation.reasoning.push('Information appears to be about recent events');
    }

    if (context.urgency.level === 'HIGH') {
      explanation.reasoning.push('Claim uses urgent language which may indicate pressure tactics');
    }

    return explanation;
  }

  /**
   * Generate cache key
   */
  generateCacheKey(text, context) {
    const key = `${text.substring(0, 100)}_${context.claimTypes.map(c => c.type).join('_')}`;
    return Buffer.from(key).toString('base64').substring(0, 32);
  }

  /**
   * Calculate cache TTL based on context
   */
  calculateCacheTTL(context) {
    // Current events: 15 minutes
    if (context.temporal.recency === 'HIGH') {
      return 15 * 60 * 1000;
    }
    
    // Product claims: 1 hour
    if (context.claimTypes.some(c => c.type === 'PRODUCT_CLAIM')) {
      return 60 * 60 * 1000;
    }
    
    // Financial claims: 30 minutes
    if (context.claimTypes.some(c => c.type === 'FINANCIAL_CLAIM')) {
      return 30 * 60 * 1000;
    }
    
    // Default: 24 hours
    return 24 * 60 * 60 * 1000;
  }

  /**
   * Cache result with TTL
   */
  cacheResult(key, result, ttl) {
    this.cache.set(key, result);
    
    // Clean up cache after TTL
    setTimeout(() => {
      this.cache.delete(key);
    }, ttl);
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      cacheSize: this.cache.size,
      sourceRegistry: this.sourceRegistry.getStats(),
      scraper: this.scraper.getStats()
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up verification engine...');
    
    if (this.scraper) {
      await this.scraper.close();
    }
    
    this.cache.clear();
    this.initialized = false;
    
    console.log('✅ Verification engine cleanup complete');
  }
}

module.exports = VerificationEngine;