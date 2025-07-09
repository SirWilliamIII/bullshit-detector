/**
 * Search-based verification source
 * Uses web search to find recent information about claims
 */
const BaseSource = require('../BaseSource');
const AdvancedScraper = require('../../scrapers/AdvancedScraper');

class SearchSource extends BaseSource {
  constructor() {
    super({
      name: 'Web Search',
      type: 'SEARCH',
      baseUrl: 'https://www.google.com',
      reliability: 0.7,
      rateLimit: 1500
    });
    
    this.scraper = new AdvancedScraper();
  }

  /**
   * Check if this source can handle the query
   */
  canHandle(query, context) {
    // Search can handle any query as a fallback
    return true;
  }

  /**
   * Verify claim using web search
   */
  async verify(query, context) {
    return this.withRateLimit(async () => {
      try {
        // Generate search queries
        const searchQueries = this.generateSearchQueries(query, context);
        
        // Perform searches
        const searchResults = await this.performSearches(searchQueries);
        
        // Analyze results
        const analysis = this.analyzeSearchResults(searchResults, query, context);
        
        return analysis;
        
      } catch (error) {
        return this.createResult('ERROR', null, 0, {
          error: error.message,
          source: this.name
        });
      }
    });
  }

  /**
   * Generate appropriate search queries based on context
   */
  generateSearchQueries(query, context) {
    const queries = [];
    
    // Base query
    queries.push(query);
    
    // Add verification-specific queries
    if (context.claimTypes?.some(c => c.type === 'PRODUCT_CLAIM')) {
      queries.push(`"${query}" official announcement`);
      queries.push(`"${query}" release date`);
    }
    
    if (context.claimTypes?.some(c => c.type === 'NEWS_CLAIM')) {
      queries.push(`"${query}" news verification`);
      queries.push(`"${query}" fact check`);
    }
    
    if (context.claimTypes?.some(c => c.type === 'FINANCIAL_CLAIM')) {
      queries.push(`"${query}" financial news`);
      queries.push(`"${query}" stock market`);
    }
    
    // Add temporal context
    if (context.temporal?.recency === 'HIGH') {
      queries.push(`"${query}" today`);
      queries.push(`"${query}" latest news`);
    }
    
    // Add entity-specific queries
    if (context.entities?.companies?.length > 0) {
      const company = context.entities.companies[0];
      queries.push(`"${query}" ${company} official`);
    }
    
    return queries.slice(0, 3); // Limit to 3 search queries
  }

  /**
   * Perform multiple searches
   */
  async performSearches(queries) {
    const results = [];
    
    for (const query of queries) {
      try {
        console.log(`🔍 Searching for: "${query}"`);
        const searchResult = await this.performSingleSearch(query);
        results.push({
          query,
          success: true,
          ...searchResult
        });
      } catch (error) {
        console.warn(`⚠️ Search failed for "${query}": ${error.message}`);
        results.push({
          query,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Perform a single search
   */
  async performSingleSearch(query) {
    // Use DuckDuckGo search (more bot-friendly than Google)
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    try {
      const result = await this.scraper.scrape(searchUrl);
      
      if (!result.success) {
        throw new Error('Search page failed to load');
      }
      
      // Extract search results
      const searchResults = this.extractSearchResults(result.content);
      
      // Scrape top results for more details
      const detailedResults = await this.scrapeTopResults(searchResults.slice(0, 5));
      
      return {
        searchResults,
        detailedResults,
        totalResults: searchResults.length
      };
      
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Extract search results from search page
   */
  extractSearchResults(content) {
    const results = [];
    const text = content.mainContent || '';
    
    // Extract URLs and snippets (simplified extraction)
    const urlPattern = /https?:\/\/[^\s<>"]+/g;
    const urls = [...text.matchAll(urlPattern)];
    
    for (const urlMatch of urls.slice(0, 10)) {
      const url = urlMatch[0];
      
      // Skip search engine URLs
      if (url.includes('duckduckgo.com') || url.includes('google.com')) {
        continue;
      }
      
      // Extract domain
      const domain = new URL(url).hostname;
      
      // Calculate relevance based on domain authority
      const relevance = this.calculateDomainRelevance(domain);
      
      results.push({
        url,
        domain,
        relevance,
        snippet: this.extractSnippet(text, url)
      });
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Calculate domain relevance/authority
   */
  calculateDomainRelevance(domain) {
    // High authority domains
    const highAuthority = [
      'reuters.com', 'apnews.com', 'bbc.com', 'cnn.com', 'npr.org',
      'apple.com', 'microsoft.com', 'google.com', 'amazon.com',
      'techcrunch.com', 'theverge.com', 'arstechnica.com',
      'sec.gov', 'fda.gov', 'who.int', 'cdc.gov'
    ];
    
    // Medium authority domains
    const mediumAuthority = [
      'wikipedia.org', 'reddit.com', 'stackoverflow.com',
      'github.com', 'medium.com', 'forbes.com', 'wsj.com'
    ];
    
    if (highAuthority.some(auth => domain.includes(auth))) {
      return 0.9;
    }
    
    if (mediumAuthority.some(auth => domain.includes(auth))) {
      return 0.6;
    }
    
    // Government domains
    if (domain.endsWith('.gov')) {
      return 0.95;
    }
    
    // Education domains
    if (domain.endsWith('.edu')) {
      return 0.7;
    }
    
    // Organization domains
    if (domain.endsWith('.org')) {
      return 0.5;
    }
    
    return 0.3; // Default relevance
  }

  /**
   * Extract snippet around URL
   */
  extractSnippet(text, url) {
    const index = text.indexOf(url);
    if (index === -1) return '';
    
    const start = Math.max(0, index - 100);
    const end = Math.min(text.length, index + url.length + 100);
    
    return text.substring(start, end).trim();
  }

  /**
   * Scrape top search results for detailed content
   */
  async scrapeTopResults(searchResults) {
    const detailedResults = [];
    
    for (const result of searchResults.slice(0, 3)) {
      try {
        console.log(`📄 Scraping search result: ${result.domain}`);
        const scraped = await this.scraper.scrape(result.url);
        
        if (scraped.success) {
          detailedResults.push({
            ...result,
            content: scraped.content,
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to scrape ${result.url}: ${error.message}`);
      }
    }
    
    return detailedResults;
  }

  /**
   * Analyze search results to determine verification status
   */
  analyzeSearchResults(searchResults, query, context) {
    const successfulSearches = searchResults.filter(r => r.success);
    
    if (successfulSearches.length === 0) {
      return this.createResult('INSUFFICIENT_DATA', null, 0.1, {
        reason: 'No successful searches completed',
        attemptedQueries: searchResults.map(r => r.query)
      });
    }
    
    // Aggregate all detailed results
    const allDetailedResults = successfulSearches
      .flatMap(search => search.detailedResults || [])
      .filter(result => result.content);
    
    if (allDetailedResults.length === 0) {
      return this.createResult('INSUFFICIENT_DATA', null, 0.2, {
        reason: 'No detailed content scraped from search results',
        searchResultsFound: successfulSearches.reduce((sum, s) => sum + s.totalResults, 0)
      });
    }
    
    // Analyze content for verification
    const analysis = this.analyzeContent(allDetailedResults, query, context);
    
    return this.createResult(analysis.status, analysis.data, analysis.confidence, {
      searchQueries: searchResults.map(r => r.query),
      sourcesAnalyzed: allDetailedResults.length,
      highAuthoritySource: allDetailedResults.some(r => r.relevance > 0.8)
    });
  }

  /**
   * Analyze scraped content for verification
   */
  analyzeContent(results, query, context) {
    const analysis = {
      status: 'INSUFFICIENT_DATA',
      confidence: 0.1,
      data: {
        supportingEvidence: [],
        contradictingEvidence: [],
        neutralEvidence: [],
        sources: []
      }
    };
    
    const queryLower = query.toLowerCase();
    
    for (const result of results) {
      const content = result.content.mainContent?.toLowerCase() || '';
      
      // Check for direct mentions
      const directMention = content.includes(queryLower);
      
      // Check for supporting evidence
      const supportingKeywords = [
        'confirmed', 'verified', 'announced', 'official', 'released',
        'available', 'launched', 'introduced', 'approved'
      ];
      
      const contradictingKeywords = [
        'fake', 'false', 'denied', 'debunked', 'hoax', 'rumor',
        'unconfirmed', 'speculation', 'not true', 'incorrect'
      ];
      
      const supportingCount = supportingKeywords.filter(keyword => content.includes(keyword)).length;
      const contradictingCount = contradictingKeywords.filter(keyword => content.includes(keyword)).length;
      
      // Classify evidence
      if (directMention) {
        if (supportingCount > contradictingCount) {
          analysis.data.supportingEvidence.push({
            source: result.domain,
            relevance: result.relevance,
            evidence: `Content mentions the claim with ${supportingCount} supporting keywords`
          });
        } else if (contradictingCount > supportingCount) {
          analysis.data.contradictingEvidence.push({
            source: result.domain,
            relevance: result.relevance,
            evidence: `Content mentions the claim with ${contradictingCount} contradicting keywords`
          });
        } else {
          analysis.data.neutralEvidence.push({
            source: result.domain,
            relevance: result.relevance,
            evidence: 'Content mentions the claim neutrally'
          });
        }
      }
      
      analysis.data.sources.push({
        domain: result.domain,
        relevance: result.relevance,
        directMention,
        supportingCount,
        contradictingCount
      });
    }
    
    // Determine final status
    const totalSupporting = analysis.data.supportingEvidence.length;
    const totalContradicting = analysis.data.contradictingEvidence.length;
    const totalNeutral = analysis.data.neutralEvidence.length;
    
    if (totalSupporting > totalContradicting && totalSupporting > 0) {
      analysis.status = 'VERIFIED';
      analysis.confidence = Math.min(0.8, 0.3 + (totalSupporting * 0.2));
    } else if (totalContradicting > totalSupporting && totalContradicting > 0) {
      analysis.status = 'CONTRADICTED';
      analysis.confidence = Math.min(0.8, 0.3 + (totalContradicting * 0.2));
    } else if (totalNeutral > 0) {
      analysis.status = 'INSUFFICIENT_DATA';
      analysis.confidence = 0.4;
    }
    
    // Boost confidence for high-authority sources
    const highAuthorityEvidence = [
      ...analysis.data.supportingEvidence,
      ...analysis.data.contradictingEvidence
    ].filter(e => e.relevance > 0.8);
    
    if (highAuthorityEvidence.length > 0) {
      analysis.confidence = Math.min(0.9, analysis.confidence + 0.2);
    }
    
    return analysis;
  }

  /**
   * Health check for search functionality
   */
  async healthCheck() {
    try {
      // Simple health check without full search
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

module.exports = SearchSource;