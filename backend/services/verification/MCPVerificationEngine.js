/**
 * MCP-Enhanced Verification Engine
 * Combines the original verification engine with MCP superpowers
 */
const VerificationEngine = require('./VerificationEngine');
const MCPOrchestrator = require('../mcp/MCPOrchestrator');

class MCPVerificationEngine extends VerificationEngine {
  constructor() {
    super();
    this.mcpOrchestrator = new MCPOrchestrator();
    this.mcpEnabled = true;
  }

  /**
   * Initialize with MCP capabilities
   */
  async initialize() {
    // Initialize original verification engine
    await super.initialize();
    
    try {
      // Initialize MCP orchestrator
      await this.mcpOrchestrator.initialize();
      this.mcpEnabled = true;
      console.log('🔥 MCP Verification Engine initialized with superpowers!');
    } catch (error) {
      console.warn('⚠️ MCP initialization failed, falling back to basic verification:', error.message);
      this.mcpEnabled = false;
    }
  }

  /**
   * Enhanced verification with MCP capabilities
   */
  async verify(text, options = {}) {
    console.log('🚀 Starting MCP-enhanced verification...');
    
    // Start with context detection
    const context = await this.contextDetector.detectContext(text);
    console.log(`🎯 Context detected: ${context.claimTypes.map(c => c.type).join(', ')}`);

    // Try MCP-enhanced verification first
    if (this.mcpEnabled) {
      try {
        const mcpResult = await this.mcpEnhancedVerification(text, context, options);
        if (mcpResult.success) {
          console.log('✅ MCP verification successful');
          return mcpResult;
        }
      } catch (error) {
        console.warn('⚠️ MCP verification failed, falling back:', error.message);
      }
    }

    // Fallback to original verification
    console.log('🔄 Using fallback verification...');
    return await super.verify(text, options);
  }

  /**
   * MCP-enhanced verification process
   */
  async mcpEnhancedVerification(text, context, options) {
    const verificationTasks = this.planMCPVerification(text, context);
    
    if (verificationTasks.length === 0) {
      throw new Error('No MCP verification tasks planned');
    }

    console.log(`🎯 Planned ${verificationTasks.length} MCP verification tasks`);

    // Execute MCP tasks in parallel
    const mcpResults = await this.mcpOrchestrator.executeMultiple(verificationTasks);
    
    // Combine with traditional sources
    const traditionalResult = await this.executeTraditionalSources(text, context);
    
    // Merge and analyze all results
    const combinedResult = this.mergeMCPAndTraditionalResults(
      mcpResults, 
      traditionalResult, 
      context
    );

    return combinedResult;
  }

  /**
   * Plan MCP verification tasks based on context
   */
  planMCPVerification(text, context) {
    const tasks = [];

    // File operations for local verification
    if (text.includes('file') || text.includes('document')) {
      tasks.push({
        capability: 'file_operations',
        parameters: { action: 'search_relevant_files', query: text }
      });
    }

    // GitHub verification for code/repository claims
    if (context.entities.companies.includes('github') || 
        text.toLowerCase().includes('repository') || 
        text.toLowerCase().includes('code')) {
      tasks.push({
        capability: 'code_management',
        parameters: { action: 'search_repositories', query: text }
      });
    }

    // Web automation for dynamic content verification
    if (context.claimTypes.some(c => c.type === 'PRODUCT_CLAIM') ||
        context.claimTypes.some(c => c.type === 'NEWS_CLAIM')) {
      
      // Extract URLs for verification
      const urls = this.extractUrls(text);
      
      if (urls.length > 0) {
        // Process each URL individually
        urls.slice(0, 3).forEach(url => {
          tasks.push({
            capability: 'web_automation',
            parameters: { 
              url: url,
              extract_claims: true,
              extract_links: true
            }
          });
        });
      } else {
        // Search for relevant pages by scraping search results
        const searchQuery = this.buildSearchQuery(text, context);
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        tasks.push({
          capability: 'web_automation',
          parameters: {
            url: searchUrl,
            extract_claims: true,
            selectors: {
              'search_results': '.g .tF2Cxc',
              'result_titles': '.g .tF2Cxc h3',
              'result_snippets': '.g .tF2Cxc .VwiC3b'
            }
          }
        });
      }
    }

    // Database verification for data claims
    if (context.claimTypes.some(c => c.type === 'FINANCIAL_CLAIM') ||
        text.toLowerCase().includes('data') ||
        text.toLowerCase().includes('statistics')) {
      tasks.push({
        capability: 'natural_language_query',
        parameters: {
          question: text,
          schema: 'public'
        }
      });
    }

    return tasks;
  }

  /**
   * Execute traditional sources alongside MCP
   */
  async executeTraditionalSources(text, context) {
    try {
      // Use a subset of original sources for speed
      const quickSources = this.sourceRegistry.selectSourcesForVerification(text, context, 2);
      
      if (quickSources.length === 0) {
        return { successful: [], failed: [], total: 0 };
      }

      const results = await Promise.allSettled(
        quickSources.map(source => this.verifyWithSource(source, text, context, 15000))
      );

      return {
        successful: results
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value),
        failed: results
          .filter(r => r.status === 'rejected')
          .map(r => ({ error: r.reason.message })),
        total: quickSources.length
      };
    } catch (error) {
      return { successful: [], failed: [{ error: error.message }], total: 0 };
    }
  }

  /**
   * Merge MCP and traditional verification results
   */
  mergeMCPAndTraditionalResults(mcpResults, traditionalResult, context) {
    const allResults = [];
    
    // Process MCP results
    for (const mcpResult of mcpResults) {
      if (mcpResult.status === 'fulfilled' && mcpResult.result.results) {
        for (const sourceResult of mcpResult.result.results) {
          if (sourceResult.success) {
            allResults.push({
              source: `MCP-${sourceResult.server}`,
              type: 'MCP',
              status: this.interpretMCPResult(sourceResult),
              confidence: this.calculateMCPConfidence(sourceResult),
              data: sourceResult.result,
              responseTime: sourceResult.responseTime,
              capability: mcpResult.capability
            });
          }
        }
      }
    }

    // Add traditional results
    for (const traditionalRes of traditionalResult.successful) {
      allResults.push({
        ...traditionalRes,
        type: 'TRADITIONAL'
      });
    }

    // Calculate enhanced consensus
    const consensus = this.calculateEnhancedConsensus(allResults);
    
    // Determine final verdict with MCP weighting
    const verdict = this.determineEnhancedVerdict(consensus, allResults, context);
    
    // Calculate confidence with MCP boost
    const confidence = this.calculateEnhancedConfidence(allResults, consensus);
    
    // Generate explanation
    const explanation = this.generateEnhancedExplanation(allResults, consensus, context);

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
        successful: allResults.length,
        failed: traditionalResult.failed.length,
        total: allResults.length + traditionalResult.failed.length,
        mcp_sources: allResults.filter(r => r.type === 'MCP').length,
        traditional_sources: allResults.filter(r => r.type === 'TRADITIONAL').length,
        results: allResults
      },
      mcp_capabilities: mcpResults.map(r => r.capability),
      metadata: {
        method: 'mcp_enhanced',
        responseTime: Date.now(),
        timestamp: new Date().toISOString(),
        mcp_enabled: this.mcpEnabled
      }
    };
  }

  /**
   * Interpret MCP result status
   */
  interpretMCPResult(sourceResult) {
    const data = sourceResult.result;
    
    // File operations
    if (sourceResult.server === 'FileSystem MCP') {
      return data && data.content ? 'VERIFIED' : 'INSUFFICIENT_DATA';
    }
    
    // GitHub operations
    if (sourceResult.server === 'GitHub MCP') {
      return data && data.total > 0 ? 'VERIFIED' : 'CONTRADICTED';
    }
    
    // Web automation
    if (sourceResult.server === 'Puppeteer MCP') {
      if (data && data.content && data.content.title) {
        // Analyze scraped content for verification indicators
        const content = data.content.text?.toLowerCase() || '';
        const verificationKeywords = ['confirmed', 'official', 'announced', 'verified'];
        const contradictionKeywords = ['false', 'fake', 'denied', 'hoax'];
        
        const verificationCount = verificationKeywords.filter(k => content.includes(k)).length;
        const contradictionCount = contradictionKeywords.filter(k => content.includes(k)).length;
        
        if (verificationCount > contradictionCount) {
          return 'VERIFIED';
        } else if (contradictionCount > verificationCount) {
          return 'CONTRADICTED';
        }
      }
      return 'INSUFFICIENT_DATA';
    }
    
    // Database operations
    if (sourceResult.server === 'PostgreSQL MCP') {
      return data && data.rows && data.rows.length > 0 ? 'VERIFIED' : 'INSUFFICIENT_DATA';
    }
    
    return 'INSUFFICIENT_DATA';
  }

  /**
   * Calculate confidence for MCP results
   */
  calculateMCPConfidence(sourceResult) {
    let baseConfidence = 0.5;
    
    // Boost confidence based on response time (faster = more confident)
    if (sourceResult.responseTime < 5000) {
      baseConfidence += 0.1;
    }
    
    // Boost confidence based on data quality
    if (sourceResult.result && typeof sourceResult.result === 'object') {
      const dataKeys = Object.keys(sourceResult.result);
      baseConfidence += Math.min(0.2, dataKeys.length * 0.02);
    }
    
    // Server-specific confidence adjustments
    if (sourceResult.server === 'GitHub MCP' && sourceResult.result?.total > 0) {
      baseConfidence += 0.2;
    }
    
    if (sourceResult.server === 'Puppeteer MCP' && sourceResult.result?.content?.title) {
      baseConfidence += 0.15;
    }
    
    return Math.min(0.9, baseConfidence);
  }

  /**
   * Calculate enhanced consensus with MCP weighting
   */
  calculateEnhancedConsensus(results) {
    if (results.length === 0) {
      return { verdict: 'INSUFFICIENT_DATA', strength: 0 };
    }

    const weightedVotes = {
      VERIFIED: 0,
      CONTRADICTED: 0,
      INSUFFICIENT_DATA: 0
    };

    for (const result of results) {
      const weight = result.type === 'MCP' ? 1.2 : 1.0; // Boost MCP results
      const adjustedConfidence = result.confidence * weight;
      
      weightedVotes[result.status] += adjustedConfidence;
    }

    const total = Object.values(weightedVotes).reduce((sum, votes) => sum + votes, 0);
    const maxVotes = Math.max(...Object.values(weightedVotes));
    const verdict = Object.keys(weightedVotes).find(key => weightedVotes[key] === maxVotes);

    return {
      verdict,
      strength: total > 0 ? maxVotes / total : 0,
      breakdown: {
        verified: weightedVotes.VERIFIED,
        contradicted: weightedVotes.CONTRADICTED,
        insufficient: weightedVotes.INSUFFICIENT_DATA,
        total: results.length
      }
    };
  }

  /**
   * Determine enhanced verdict with MCP considerations
   */
  determineEnhancedVerdict(consensus, results, context) {
    // High confidence threshold for MCP-enhanced results
    if (consensus.strength > 0.8) {
      return consensus.verdict;
    }

    // Special handling for real-time claims
    if (context.temporal.recency === 'HIGH') {
      const mcpResults = results.filter(r => r.type === 'MCP');
      if (mcpResults.length > 0 && mcpResults.some(r => r.status === 'VERIFIED')) {
        return 'VERIFIED';
      }
    }

    // Default consensus-based verdict
    return consensus.verdict;
  }

  /**
   * Calculate enhanced confidence with MCP boost
   */
  calculateEnhancedConfidence(results, consensus) {
    if (results.length === 0) return 0;

    let baseConfidence = consensus.strength;
    
    // Boost for MCP diversity
    const mcpSources = new Set(results.filter(r => r.type === 'MCP').map(r => r.source));
    const diversityBonus = Math.min(0.2, mcpSources.size * 0.05);
    
    // Boost for real-time capabilities
    const hasWebAutomation = results.some(r => r.capability === 'web_automation');
    const realtimeBonus = hasWebAutomation ? 0.1 : 0;
    
    return Math.min(0.95, baseConfidence + diversityBonus + realtimeBonus);
  }

  /**
   * Generate enhanced explanation
   */
  generateEnhancedExplanation(results, consensus, context) {
    const explanation = {
      summary: '',
      details: [],
      reasoning: [],
      mcp_insights: []
    };

    const mcpResults = results.filter(r => r.type === 'MCP');
    const traditionalResults = results.filter(r => r.type === 'TRADITIONAL');

    // Generate summary
    explanation.summary = `Enhanced verification using ${mcpResults.length} MCP sources and ${traditionalResults.length} traditional sources: ${consensus.verdict.toLowerCase().replace('_', ' ')}`;

    // Add MCP-specific insights
    for (const mcpResult of mcpResults) {
      if (mcpResult.status === 'VERIFIED') {
        explanation.mcp_insights.push(`🔥 ${mcpResult.source}: Real-time verification confirmed`);
      } else if (mcpResult.status === 'CONTRADICTED') {
        explanation.mcp_insights.push(`⚠️ ${mcpResult.source}: Found contradicting evidence`);
      }
    }

    // Add detailed results
    for (const result of results) {
      const emoji = result.status === 'VERIFIED' ? '✅' : 
                   result.status === 'CONTRADICTED' ? '❌' : '❓';
      const prefix = result.type === 'MCP' ? '🔥' : '📊';
      explanation.details.push(`${prefix}${emoji} ${result.source}: ${result.status}`);
    }

    // Add reasoning
    if (mcpResults.length > 0) {
      explanation.reasoning.push('Used real-time MCP capabilities for enhanced verification');
    }
    
    if (context.temporal.recency === 'HIGH') {
      explanation.reasoning.push('Applied real-time verification for current events');
    }

    return explanation;
  }

  /**
   * Extract URLs from text
   */
  extractUrls(text) {
    const urlRegex = /https?:\/\/[^\s<>"]+/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Build search query from text and context
   */
  buildSearchQuery(text, context) {
    let query = text;
    
    // Add entity-specific terms
    if (context.entities.companies.length > 0) {
      query += ` ${context.entities.companies[0]}`;
    }
    
    if (context.entities.products.length > 0) {
      query += ` ${context.entities.products[0]}`;
    }
    
    // Add temporal terms
    if (context.temporal.recency === 'HIGH') {
      query += ' latest news';
    }
    
    return query;
  }

  /**
   * Get enhanced statistics
   */
  getStats() {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      mcp: {
        enabled: this.mcpEnabled,
        orchestrator: this.mcpEnabled ? this.mcpOrchestrator.getStats() : null
      }
    };
  }

  /**
   * Enhanced cleanup
   */
  async cleanup() {
    console.log('🧹 Cleaning up MCP Verification Engine...');
    
    if (this.mcpOrchestrator) {
      await this.mcpOrchestrator.cleanup();
    }
    
    await super.cleanup();
    
    console.log('✅ MCP Verification Engine cleanup complete');
  }
}

module.exports = MCPVerificationEngine;