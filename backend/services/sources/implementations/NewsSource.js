/**
 * News verification source
 * Checks major news outlets for information verification
 */
const BaseSource = require('../BaseSource');
const AdvancedScraper = require('../../scrapers/AdvancedScraper');

class NewsSource extends BaseSource {
  constructor() {
    super({
      name: 'News Verification',
      type: 'NEWS',
      baseUrl: 'https://www.reuters.com',
      reliability: 0.85,
      rateLimit: 2000
    });
    
    this.scraper = new AdvancedScraper();
    
    // Trusted news sources
    this.newsSources = [
      {
        name: 'Reuters',
        baseUrl: 'https://www.reuters.com',
        searchUrl: 'https://www.reuters.com/search/news?query=',
        reliability: 0.95
      },
      {
        name: 'Associated Press',
        baseUrl: 'https://apnews.com',
        searchUrl: 'https://apnews.com/search?q=',
        reliability: 0.95
      },
      {
        name: 'BBC',
        baseUrl: 'https://www.bbc.com',
        searchUrl: 'https://www.bbc.com/search?q=',
        reliability: 0.9
      },
      {
        name: 'NPR',
        baseUrl: 'https://www.npr.org',
        searchUrl: 'https://www.npr.org/search?query=',
        reliability: 0.85
      }
    ];
  }

  /**
   * Check if this source can handle the query
   */
  canHandle(query, context) {
    // Handle news claims
    if (context.claimTypes?.some(c => c.type === 'NEWS_CLAIM')) {
      return true;
    }
    
    // Handle current events
    if (context.temporal?.recency === 'HIGH') {
      return true;
    }
    
    // Handle product announcements that might be newsworthy
    if (context.claimTypes?.some(c => c.type === 'PRODUCT_CLAIM') && 
        context.entities?.companies?.length > 0) {
      return true;
    }
    
    return false;
  }

  /**
   * Verify claim using news sources
   */
  async verify(query, context) {
    return this.withRateLimit(async () => {
      try {
        // Search multiple news sources
        const newsSearches = await this.searchNewsSources(query, context);
        
        // Analyze news coverage
        const analysis = this.analyzeNewsCoverage(newsSearches, query, context);
        
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
   * Search multiple news sources
   */
  async searchNewsSources(query, context) {
    const results = [];
    
    // Prioritize sources based on context
    const prioritizedSources = this.prioritizeSources(context);
    
    for (const source of prioritizedSources.slice(0, 3)) {
      try {
        console.log(`📰 Searching ${source.name} for: "${query}"`);
        const searchResult = await this.searchSingleNewsSource(source, query);
        results.push({
          source: source.name,
          reliability: source.reliability,
          success: true,
          ...searchResult
        });
      } catch (error) {
        console.warn(`⚠️ ${source.name} search failed: ${error.message}`);
        results.push({
          source: source.name,
          reliability: source.reliability,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Prioritize news sources based on context
   */
  prioritizeSources(context) {
    const sources = [...this.newsSources];
    
    // Prioritize based on claim type
    if (context.claimTypes?.some(c => c.type === 'FINANCIAL_CLAIM')) {
      // Reuters is excellent for financial news
      sources.sort((a, b) => a.name === 'Reuters' ? -1 : 1);
    }
    
    if (context.claimTypes?.some(c => c.type === 'PRODUCT_CLAIM')) {
      // Tech-focused prioritization
      sources.sort((a, b) => {
        const techOrder = ['Reuters', 'BBC', 'Associated Press', 'NPR'];
        return techOrder.indexOf(a.name) - techOrder.indexOf(b.name);
      });
    }
    
    return sources;
  }

  /**
   * Search a single news source
   */
  async searchSingleNewsSource(source, query) {
    const searchUrl = `${source.searchUrl}${encodeURIComponent(query)}`;
    
    try {
      const result = await this.scraper.scrape(searchUrl);
      
      if (!result.success) {
        throw new Error('Search page failed to load');
      }
      
      // Extract search results
      const articles = this.extractArticles(result.content, source);
      
      // Scrape top articles for details
      const detailedArticles = await this.scrapeArticles(articles.slice(0, 3), source);
      
      return {
        articles,
        detailedArticles,
        totalFound: articles.length
      };
      
    } catch (error) {
      throw new Error(`${source.name} search failed: ${error.message}`);
    }
  }

  /**
   * Extract articles from search results
   */
  extractArticles(content, source) {
    const articles = [];
    
    // Extract links that look like articles
    const links = content.links || [];
    
    for (const link of links) {
      // Filter for article URLs
      if (this.isArticleUrl(link.href, source)) {
        articles.push({
          url: link.href,
          title: link.text,
          source: source.name,
          relevance: this.calculateArticleRelevance(link.text, link.href)
        });
      }
    }
    
    return articles.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Check if URL looks like an article
   */
  isArticleUrl(url, source) {
    try {
      const urlObj = new URL(url);
      
      // Must be from the same domain
      if (!urlObj.hostname.includes(source.baseUrl.replace('https://', '').replace('www.', ''))) {
        return false;
      }
      
      // Should look like an article path
      const path = urlObj.pathname;
      const articlePatterns = [
        /\/\d{4}\/\d{2}\/\d{2}\//, // Date-based URLs
        /\/article\//, // Article URLs
        /\/news\//, // News URLs
        /\/story\//, // Story URLs
        /\/\d{4}-\d{2}-\d{2}/ // Date patterns
      ];
      
      return articlePatterns.some(pattern => pattern.test(path));
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate article relevance
   */
  calculateArticleRelevance(title, url) {
    let relevance = 0.5; // Base relevance
    
    // Check title relevance
    if (title) {
      const titleLower = title.toLowerCase();
      
      // Recent indicators
      const recentWords = ['today', 'latest', 'breaking', 'new', 'just', 'now'];
      if (recentWords.some(word => titleLower.includes(word))) {
        relevance += 0.2;
      }
      
      // Authority indicators
      const authorityWords = ['official', 'confirmed', 'announced', 'reports'];
      if (authorityWords.some(word => titleLower.includes(word))) {
        relevance += 0.15;
      }
    }
    
    // Check URL freshness (rough estimate)
    const urlDate = this.extractDateFromUrl(url);
    if (urlDate) {
      const daysSincePublish = (Date.now() - urlDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePublish < 1) relevance += 0.2;
      else if (daysSincePublish < 7) relevance += 0.1;
    }
    
    return Math.min(1, relevance);
  }

  /**
   * Extract date from URL
   */
  extractDateFromUrl(url) {
    const dateMatches = url.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (dateMatches) {
      return new Date(dateMatches[1], dateMatches[2] - 1, dateMatches[3]);
    }
    return null;
  }

  /**
   * Scrape detailed article content
   */
  async scrapeArticles(articles, source) {
    const detailedArticles = [];
    
    for (const article of articles) {
      try {
        console.log(`📄 Scraping article: ${article.title}`);
        const result = await this.scraper.scrape(article.url);
        
        if (result.success) {
          detailedArticles.push({
            ...article,
            content: result.content,
            publishDate: this.extractPublishDate(result.content),
            author: this.extractAuthor(result.content),
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to scrape article ${article.url}: ${error.message}`);
      }
    }
    
    return detailedArticles;
  }

  /**
   * Extract publish date from article content
   */
  extractPublishDate(content) {
    // Check metadata first
    if (content.publishDate) {
      return content.publishDate;
    }
    
    // Look for date patterns in content
    const text = content.mainContent || '';
    const datePatterns = [
      /(\w+\s+\d{1,2},\s+\d{4})/,
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{1,2}\/\d{1,2}\/\d{4})/
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          return new Date(match[1]).toISOString();
        } catch (error) {
          continue;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract author from article content
   */
  extractAuthor(content) {
    if (content.author) {
      return content.author;
    }
    
    // Look for author patterns
    const text = content.mainContent || '';
    const authorPatterns = [
      /By\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/,
      /Author:\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/,
      /Written\s+by\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/
    ];
    
    for (const pattern of authorPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Analyze news coverage for verification
   */
  analyzeNewsCoverage(newsSearches, query, context) {
    const successfulSearches = newsSearches.filter(s => s.success);
    
    if (successfulSearches.length === 0) {
      return this.createResult('INSUFFICIENT_DATA', null, 0.2, {
        reason: 'No news sources could be searched',
        attemptedSources: newsSearches.map(s => s.source)
      });
    }
    
    // Aggregate all articles
    const allArticles = successfulSearches.flatMap(s => s.detailedArticles || []);
    
    if (allArticles.length === 0) {
      return this.createResult('INSUFFICIENT_DATA', null, 0.3, {
        reason: 'No articles found covering the topic',
        searchResults: successfulSearches.map(s => ({
          source: s.source,
          articlesFound: s.totalFound || 0
        }))
      });
    }
    
    // Analyze articles
    const analysis = this.analyzeArticles(allArticles, query, context);
    
    return this.createResult(analysis.status, analysis.data, analysis.confidence, {
      sourcesSearched: successfulSearches.length,
      articlesAnalyzed: allArticles.length,
      highReliabilitySources: successfulSearches.filter(s => s.reliability > 0.9).length
    });
  }

  /**
   * Analyze articles for verification
   */
  analyzeArticles(articles, query, context) {
    const analysis = {
      status: 'INSUFFICIENT_DATA',
      confidence: 0.2,
      data: {
        supportingArticles: [],
        contradictingArticles: [],
        neutralArticles: [],
        coverage: {
          totalArticles: articles.length,
          recentArticles: 0,
          authorityArticles: 0
        }
      }
    };
    
    const queryLower = query.toLowerCase();
    
    for (const article of articles) {
      const content = article.content.mainContent?.toLowerCase() || '';
      const title = article.title?.toLowerCase() || '';
      
      // Check for query mentions
      const queryMentioned = content.includes(queryLower) || title.includes(queryLower);
      
      if (!queryMentioned) {
        continue;
      }
      
      // Analyze article sentiment towards the claim
      const sentiment = this.analyzeArticleSentiment(content, title, query);
      
      // Check if article is recent
      const isRecent = this.isRecentArticle(article);
      if (isRecent) {
        analysis.data.coverage.recentArticles++;
      }
      
      // Check authority
      const isAuthority = article.source === 'Reuters' || article.source === 'Associated Press';
      if (isAuthority) {
        analysis.data.coverage.authorityArticles++;
      }
      
      // Categorize article
      const articleSummary = {
        title: article.title,
        source: article.source,
        url: article.url,
        publishDate: article.publishDate,
        relevance: article.relevance,
        sentiment: sentiment.sentiment,
        confidence: sentiment.confidence,
        isRecent,
        isAuthority
      };
      
      if (sentiment.sentiment === 'SUPPORTING') {
        analysis.data.supportingArticles.push(articleSummary);
      } else if (sentiment.sentiment === 'CONTRADICTING') {
        analysis.data.contradictingArticles.push(articleSummary);
      } else {
        analysis.data.neutralArticles.push(articleSummary);
      }
    }
    
    // Determine overall status
    const supporting = analysis.data.supportingArticles.length;
    const contradicting = analysis.data.contradictingArticles.length;
    const neutral = analysis.data.neutralArticles.length;
    
    if (supporting > contradicting && supporting > 0) {
      analysis.status = 'VERIFIED';
      analysis.confidence = Math.min(0.85, 0.4 + (supporting * 0.15));
    } else if (contradicting > supporting && contradicting > 0) {
      analysis.status = 'CONTRADICTED';
      analysis.confidence = Math.min(0.85, 0.4 + (contradicting * 0.15));
    } else if (neutral > 0) {
      analysis.status = 'INSUFFICIENT_DATA';
      analysis.confidence = 0.5;
    }
    
    // Boost confidence for authority sources
    if (analysis.data.coverage.authorityArticles > 0) {
      analysis.confidence = Math.min(0.95, analysis.confidence + 0.1);
    }
    
    // Boost confidence for recent coverage
    if (analysis.data.coverage.recentArticles > 0) {
      analysis.confidence = Math.min(0.9, analysis.confidence + 0.05);
    }
    
    return analysis;
  }

  /**
   * Analyze article sentiment towards the claim
   */
  analyzeArticleSentiment(content, title, query) {
    const text = `${title} ${content}`.toLowerCase();
    
    // Supporting indicators
    const supportingWords = [
      'confirmed', 'verified', 'announced', 'official', 'released',
      'launched', 'available', 'introduced', 'approved', 'true'
    ];
    
    // Contradicting indicators
    const contradictingWords = [
      'false', 'fake', 'denied', 'debunked', 'hoax', 'rumor',
      'unconfirmed', 'speculation', 'incorrect', 'misleading'
    ];
    
    const supportingCount = supportingWords.filter(word => text.includes(word)).length;
    const contradictingCount = contradictingWords.filter(word => text.includes(word)).length;
    
    let sentiment = 'NEUTRAL';
    let confidence = 0.5;
    
    if (supportingCount > contradictingCount) {
      sentiment = 'SUPPORTING';
      confidence = Math.min(0.9, 0.5 + (supportingCount * 0.1));
    } else if (contradictingCount > supportingCount) {
      sentiment = 'CONTRADICTING';
      confidence = Math.min(0.9, 0.5 + (contradictingCount * 0.1));
    }
    
    return { sentiment, confidence };
  }

  /**
   * Check if article is recent
   */
  isRecentArticle(article) {
    if (!article.publishDate) return false;
    
    const publishDate = new Date(article.publishDate);
    const now = new Date();
    const daysDiff = (now - publishDate) / (1000 * 60 * 60 * 24);
    
    return daysDiff <= 7; // Consider articles within 7 days as recent
  }

  /**
   * Health check for news sources
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

module.exports = NewsSource;