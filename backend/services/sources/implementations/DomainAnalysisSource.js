/**
 * Domain analysis source for URL and domain verification
 * Uses existing WHOIS functionality and web scraping for domain analysis
 */
const BaseSource = require('../BaseSource');
const whois = require('whois');
const { promisify } = require('util');
const AdvancedScraper = require('../../scrapers/AdvancedScraper');

class DomainAnalysisSource extends BaseSource {
  constructor() {
    super({
      name: 'Domain Analysis',
      type: 'DOMAIN_ANALYSIS',
      baseUrl: '',
      reliability: 0.8,
      rateLimit: 1000
    });
    
    this.whoisLookup = promisify(whois.lookup);
    this.scraper = new AdvancedScraper();
  }

  /**
   * Check if this source can handle the query
   */
  canHandle(query, context) {
    // Handle queries containing URLs or domain names
    const hasUrl = /https?:\/\/[^\s]+/.test(query);
    const hasDomain = /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(query);
    
    return hasUrl || hasDomain;
  }

  /**
   * Verify claim by analyzing domains/URLs mentioned
   */
  async verify(query, context) {
    return this.withRateLimit(async () => {
      try {
        // Extract URLs and domains from query
        const urls = this.extractUrls(query);
        const domains = this.extractDomains(query);
        
        if (urls.length === 0 && domains.length === 0) {
          return this.createResult('INSUFFICIENT_DATA', null, 0.1, {
            reason: 'No URLs or domains found in query'
          });
        }
        
        // Analyze domains
        const domainAnalyses = await this.analyzeDomains([...urls, ...domains]);
        
        // Analyze URLs (if any)
        const urlAnalyses = await this.analyzeUrls(urls);
        
        // Combine analyses
        const combinedAnalysis = this.combineAnalyses(domainAnalyses, urlAnalyses);
        
        return combinedAnalysis;
        
      } catch (error) {
        return this.createResult('ERROR', null, 0, {
          error: error.message,
          source: this.name
        });
      }
    });
  }

  /**
   * Extract URLs from text
   */
  extractUrls(text) {
    const urlRegex = /https?:\/\/[^\s<>"]+/g;
    const matches = text.match(urlRegex) || [];
    
    return matches.map(url => {
      try {
        return new URL(url).href;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * Extract domains from text
   */
  extractDomains(text) {
    const domainRegex = /(?:^|\s)([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?:\s|$)/g;
    const matches = [];
    let match;
    
    while ((match = domainRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  /**
   * Analyze multiple domains
   */
  async analyzeDomains(domains) {
    const analyses = [];
    
    for (const domain of domains.slice(0, 5)) { // Limit to 5 domains
      try {
        const analysis = await this.analyzeSingleDomain(domain);
        analyses.push(analysis);
      } catch (error) {
        console.warn(`⚠️ Failed to analyze domain ${domain}: ${error.message}`);
        analyses.push({
          domain,
          error: error.message,
          suspicious: false
        });
      }
    }
    
    return analyses;
  }

  /**
   * Analyze a single domain
   */
  async analyzeSingleDomain(domain) {
    // Extract domain from URL if needed
    const cleanDomain = domain.startsWith('http') ? new URL(domain).hostname : domain;
    
    console.log(`🔍 Analyzing domain: ${cleanDomain}`);
    
    const analysis = {
      domain: cleanDomain,
      whoisData: null,
      registrationDate: null,
      isRecentlyRegistered: null,
      isExpired: null,
      registrar: null,
      nameServers: [],
      suspiciousPatterns: [],
      trustScore: 0.5,
      suspicious: false
    };
    
    try {
      // WHOIS lookup
      const whoisData = await this.whoisLookup(cleanDomain);
      analysis.whoisData = whoisData.substring(0, 1000); // Limit size
      
      // Extract registration information
      const registrationInfo = this.extractRegistrationInfo(whoisData);
      analysis.registrationDate = registrationInfo.registrationDate;
      analysis.isRecentlyRegistered = registrationInfo.isRecentlyRegistered;
      analysis.isExpired = registrationInfo.isExpired;
      analysis.registrar = registrationInfo.registrar;
      analysis.nameServers = registrationInfo.nameServers;
      
      // Check for suspicious patterns
      analysis.suspiciousPatterns = this.checkSuspiciousPatterns(cleanDomain, whoisData);
      
      // Calculate trust score
      analysis.trustScore = this.calculateTrustScore(analysis);
      analysis.suspicious = analysis.trustScore < 0.3;
      
    } catch (error) {
      console.warn(`⚠️ WHOIS lookup failed for ${cleanDomain}: ${error.message}`);
      analysis.error = error.message;
      
      // Still check for suspicious patterns in domain name
      analysis.suspiciousPatterns = this.checkSuspiciousPatterns(cleanDomain, '');
      analysis.trustScore = this.calculateTrustScore(analysis);
      analysis.suspicious = analysis.trustScore < 0.3;
    }
    
    return analysis;
  }

  /**
   * Extract registration information from WHOIS data
   */
  extractRegistrationInfo(whoisData) {
    const info = {
      registrationDate: null,
      isRecentlyRegistered: null,
      isExpired: null,
      registrar: null,
      nameServers: []
    };
    
    // Extract registration date
    const datePatterns = [
      /Creation Date:\s*([^\r\n]+)/i,
      /Created:\s*([^\r\n]+)/i,
      /Registered:\s*([^\r\n]+)/i,
      /Registration Date:\s*([^\r\n]+)/i,
      /Domain Registration Date:\s*([^\r\n]+)/i
    ];
    
    for (const pattern of datePatterns) {
      const match = whoisData.match(pattern);
      if (match) {
        info.registrationDate = match[1].trim();
        break;
      }
    }
    
    // Check if recently registered
    if (info.registrationDate) {
      try {
        const registrationDate = new Date(info.registrationDate);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        info.isRecentlyRegistered = registrationDate > sixMonthsAgo;
      } catch (error) {
        info.isRecentlyRegistered = null;
      }
    }
    
    // Extract expiration date
    const expirationPatterns = [
      /Expiration Date:\s*([^\r\n]+)/i,
      /Expires:\s*([^\r\n]+)/i,
      /Expiry Date:\s*([^\r\n]+)/i
    ];
    
    for (const pattern of expirationPatterns) {
      const match = whoisData.match(pattern);
      if (match) {
        try {
          const expirationDate = new Date(match[1].trim());
          info.isExpired = expirationDate < new Date();
        } catch (error) {
          info.isExpired = null;
        }
        break;
      }
    }
    
    // Extract registrar
    const registrarMatch = whoisData.match(/Registrar:\s*([^\r\n]+)/i);
    if (registrarMatch) {
      info.registrar = registrarMatch[1].trim();
    }
    
    // Extract name servers
    const nameServerMatches = whoisData.match(/Name Server:\s*([^\r\n]+)/gi);
    if (nameServerMatches) {
      info.nameServers = nameServerMatches.map(match => 
        match.replace(/Name Server:\s*/i, '').trim()
      );
    }
    
    return info;
  }

  /**
   * Check for suspicious patterns in domain
   */
  checkSuspiciousPatterns(domain, whoisData) {
    const patterns = [];
    
    // Suspicious domain patterns
    const suspiciousDomainPatterns = [
      {
        pattern: /\d{4,}/,
        reason: 'Contains long numeric sequence',
        severity: 'MEDIUM'
      },
      {
        pattern: /^[a-z]+\d+[a-z]+$/,
        reason: 'Mixed letters and numbers pattern',
        severity: 'LOW'
      },
      {
        pattern: /(.)\1{3,}/,
        reason: 'Repeated characters',
        severity: 'MEDIUM'
      },
      {
        pattern: /-(claim|prize|winner|reward|free|gift)$/,
        reason: 'Suspicious keyword in domain',
        severity: 'HIGH'
      },
      {
        pattern: /(apple|google|microsoft|amazon|facebook|paypal|ebay|amazon)-/,
        reason: 'Potential brand impersonation',
        severity: 'HIGH'
      },
      {
        pattern: /\.(tk|ml|ga|cf)$/,
        reason: 'Free/suspicious TLD',
        severity: 'HIGH'
      }
    ];
    
    for (const { pattern, reason, severity } of suspiciousDomainPatterns) {
      if (pattern.test(domain)) {
        patterns.push({ pattern: pattern.source, reason, severity });
      }
    }
    
    // Check length
    if (domain.length > 20) {
      patterns.push({
        pattern: 'domain_length',
        reason: 'Unusually long domain name',
        severity: 'LOW'
      });
    }
    
    // Check for privacy protection in WHOIS
    if (whoisData.toLowerCase().includes('privacy') || 
        whoisData.toLowerCase().includes('redacted')) {
      patterns.push({
        pattern: 'privacy_protection',
        reason: 'Domain has privacy protection (common but can hide identity)',
        severity: 'LOW'
      });
    }
    
    return patterns;
  }

  /**
   * Calculate trust score for domain
   */
  calculateTrustScore(analysis) {
    let score = 0.5; // Base score
    
    // Penalize recently registered domains
    if (analysis.isRecentlyRegistered === true) {
      score -= 0.3;
    } else if (analysis.isRecentlyRegistered === false) {
      score += 0.1;
    }
    
    // Penalize expired domains
    if (analysis.isExpired === true) {
      score -= 0.4;
    }
    
    // Penalize suspicious patterns
    for (const pattern of analysis.suspiciousPatterns) {
      if (pattern.severity === 'HIGH') {
        score -= 0.2;
      } else if (pattern.severity === 'MEDIUM') {
        score -= 0.1;
      } else if (pattern.severity === 'LOW') {
        score -= 0.05;
      }
    }
    
    // Bonus for established registrars
    const trustedRegistrars = ['GoDaddy', 'Namecheap', 'Google', 'Amazon', 'Cloudflare'];
    if (analysis.registrar && trustedRegistrars.some(registrar => 
        analysis.registrar.toLowerCase().includes(registrar.toLowerCase()))) {
      score += 0.1;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Analyze URLs by scraping content
   */
  async analyzeUrls(urls) {
    const analyses = [];
    
    for (const url of urls.slice(0, 3)) { // Limit to 3 URLs
      try {
        console.log(`🔗 Analyzing URL: ${url}`);
        const analysis = await this.analyzeSingleUrl(url);
        analyses.push(analysis);
      } catch (error) {
        console.warn(`⚠️ Failed to analyze URL ${url}: ${error.message}`);
        analyses.push({
          url,
          error: error.message,
          suspicious: false
        });
      }
    }
    
    return analyses;
  }

  /**
   * Analyze a single URL
   */
  async analyzeSingleUrl(url) {
    const analysis = {
      url,
      domain: new URL(url).hostname,
      hasSSL: url.startsWith('https://'),
      content: null,
      suspiciousContent: [],
      trustScore: 0.5,
      suspicious: false
    };
    
    try {
      // Scrape URL content
      const result = await this.scraper.scrape(url);
      
      if (result.success) {
        analysis.content = {
          title: result.content.title,
          description: result.content.description,
          hasStructuredData: result.content.structuredData?.length > 0,
          linkCount: result.content.links?.length || 0,
          imageCount: result.content.images?.length || 0
        };
        
        // Check for suspicious content
        analysis.suspiciousContent = this.checkSuspiciousContent(result.content);
        
        // Calculate trust score
        analysis.trustScore = this.calculateUrlTrustScore(analysis);
        analysis.suspicious = analysis.trustScore < 0.3;
      } else {
        analysis.error = 'Failed to scrape URL content';
      }
      
    } catch (error) {
      analysis.error = error.message;
    }
    
    return analysis;
  }

  /**
   * Check for suspicious content patterns
   */
  checkSuspiciousContent(content) {
    const suspiciousPatterns = [];
    const text = content.mainContent?.toLowerCase() || '';
    
    // Check for scam indicators
    const scamPatterns = [
      {
        pattern: /free\s+(?:iphone|money|gift|prize)/g,
        reason: 'Free item offers',
        severity: 'HIGH'
      },
      {
        pattern: /click\s+here\s+(?:now|immediately|urgent)/g,
        reason: 'Urgent click prompts',
        severity: 'HIGH'
      },
      {
        pattern: /winner|selected|congratulations/g,
        reason: 'Winner/prize language',
        severity: 'MEDIUM'
      },
      {
        pattern: /verify\s+(?:account|information|identity)/g,
        reason: 'Account verification requests',
        severity: 'HIGH'
      },
      {
        pattern: /limited\s+time|expires\s+(?:today|soon)/g,
        reason: 'Time pressure tactics',
        severity: 'MEDIUM'
      }
    ];
    
    for (const { pattern, reason, severity } of scamPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        suspiciousPatterns.push({
          pattern: pattern.source,
          reason,
          severity,
          matches: matches.length
        });
      }
    }
    
    return suspiciousPatterns;
  }

  /**
   * Calculate trust score for URL
   */
  calculateUrlTrustScore(analysis) {
    let score = 0.5; // Base score
    
    // Bonus for HTTPS
    if (analysis.hasSSL) {
      score += 0.1;
    } else {
      score -= 0.2;
    }
    
    // Bonus for structured data
    if (analysis.content?.hasStructuredData) {
      score += 0.1;
    }
    
    // Penalize suspicious content
    for (const pattern of analysis.suspiciousContent) {
      if (pattern.severity === 'HIGH') {
        score -= 0.2 * pattern.matches;
      } else if (pattern.severity === 'MEDIUM') {
        score -= 0.1 * pattern.matches;
      }
    }
    
    // Penalize if too many suspicious patterns
    if (analysis.suspiciousContent.length > 3) {
      score -= 0.2;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Combine domain and URL analyses
   */
  combineAnalyses(domainAnalyses, urlAnalyses) {
    const allAnalyses = [...domainAnalyses, ...urlAnalyses];
    
    if (allAnalyses.length === 0) {
      return this.createResult('INSUFFICIENT_DATA', null, 0.1, {
        reason: 'No domains or URLs could be analyzed'
      });
    }
    
    const suspiciousCount = allAnalyses.filter(a => a.suspicious).length;
    const totalCount = allAnalyses.length;
    const avgTrustScore = allAnalyses.reduce((sum, a) => sum + (a.trustScore || 0), 0) / totalCount;
    
    let status = 'INSUFFICIENT_DATA';
    let confidence = 0.3;
    
    if (suspiciousCount > totalCount / 2) {
      status = 'CONTRADICTED'; // Suspicious domains contradict legitimacy
      confidence = 0.7 + (suspiciousCount / totalCount) * 0.2;
    } else if (avgTrustScore > 0.7) {
      status = 'VERIFIED'; // Trustworthy domains
      confidence = avgTrustScore;
    } else if (avgTrustScore > 0.4) {
      status = 'INSUFFICIENT_DATA'; // Neutral
      confidence = 0.5;
    } else {
      status = 'CONTRADICTED'; // Low trust
      confidence = 0.6;
    }
    
    return this.createResult(status, {
      domains: domainAnalyses,
      urls: urlAnalyses,
      summary: {
        totalAnalyzed: totalCount,
        suspiciousCount,
        averageTrustScore: avgTrustScore,
        recommendation: suspiciousCount > 0 ? 'Exercise caution with these domains' : 'Domains appear legitimate'
      }
    }, confidence, {
      analysisType: 'domain_analysis',
      domainsAnalyzed: domainAnalyses.length,
      urlsAnalyzed: urlAnalyses.length
    });
  }

  /**
   * Health check for domain analysis
   */
  async healthCheck() {
    try {
      const testDomain = 'example.com';
      const analysis = await this.analyzeSingleDomain(testDomain);
      
      return {
        healthy: !analysis.error,
        responseTime: Date.now() - this.lastRequest,
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

module.exports = DomainAnalysisSource;