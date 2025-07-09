/**
 * AI-powered context detection for intelligent claim analysis
 * Identifies claim types, entities, and determines appropriate verification strategies
 */
class ContextDetector {
  constructor() {
    this.patterns = {
      // Product claims
      PRODUCT_CLAIM: [
        /(?:new|latest|newest)\s+(?:iphone|ipad|macbook|samsung|pixel|tesla)/i,
        /(?:iphone|ipad|macbook)\s+(?:\d+|pro|max|mini|air)/i,
        /(?:version|model|generation)\s+(?:\d+|pro|max|mini)/i,
        /(?:released|launched|announced|available)\s+(?:today|now|this\s+(?:week|month|year))/i
      ],
      
      // Financial claims
      FINANCIAL_CLAIM: [
        /(?:stock|share|investment|crypto|bitcoin|ethereum)\s+(?:price|value|worth)/i,
        /(?:company|corporation)\s+(?:worth|valued|market\s+cap)/i,
        /(?:\$|USD|dollars?)\s*[\d,]+(?:\s*(?:million|billion|trillion))?/i,
        /(?:profit|revenue|earnings|loss)\s+(?:of|reached|hit)/i
      ],
      
      // News/Current Events
      NEWS_CLAIM: [
        /(?:breaking|news|reported|sources?\s+say|according\s+to)/i,
        /(?:yesterday|today|this\s+(?:morning|afternoon|evening))/i,
        /(?:president|minister|government|congress|senate)/i,
        /(?:announced|declared|confirmed|denied)/i
      ],
      
      // Health claims
      HEALTH_CLAIM: [
        /(?:cure|treatment|medicine|drug|vaccine|therapy)/i,
        /(?:fda|who|cdc|health\s+department)\s+(?:approved|banned|warning)/i,
        /(?:study|research|clinical\s+trial)\s+(?:shows|proves|finds)/i,
        /(?:side\s+effects|risks|benefits|effectiveness)/i
      ],
      
      // Celebrity/People claims
      CELEBRITY_CLAIM: [
        /(?:celebrity|actor|actress|singer|musician|athlete)\s+(?:died|arrested|married)/i,
        /(?:famous|well-known)\s+(?:person|people|individual)/i,
        /(?:twitter|instagram|social\s+media)\s+(?:post|statement|announcement)/i
      ],
      
      // Scam patterns
      SCAM_PATTERN: [
        /(?:free|win|won|winner|selected|chosen|congratulations)/i,
        /(?:urgent|expires|limited\s+time|act\s+now|deadline)/i,
        /(?:click\s+here|claim\s+now|verify\s+account|update\s+information)/i,
        /(?:suspicious|phishing|scam|fraud|fake)/i
      ]
    };

    this.entities = {
      // Technology entities
      TECH_COMPANIES: ['apple', 'google', 'microsoft', 'amazon', 'meta', 'tesla', 'samsung', 'sony'],
      TECH_PRODUCTS: ['iphone', 'ipad', 'macbook', 'android', 'windows', 'playstation', 'xbox'],
      
      // Financial entities
      FINANCIAL_TERMS: ['stock', 'cryptocurrency', 'bitcoin', 'ethereum', 'nasdaq', 'nyse', 'sec'],
      
      // Government entities
      GOVERNMENT_ORGS: ['fda', 'fbi', 'cia', 'irs', 'cdc', 'who', 'un', 'congress', 'senate'],
      
      // News organizations
      NEWS_ORGS: ['reuters', 'ap', 'bbc', 'cnn', 'fox', 'nytimes', 'wsj', 'guardian']
    };
  }

  /**
   * Analyze text to detect context and claim type
   */
  async detectContext(text) {
    const lowerText = text.toLowerCase();
    
    // Detect claim types
    const claimTypes = this.detectClaimTypes(lowerText);
    
    // Extract entities
    const entities = this.extractEntities(lowerText);
    
    // Detect temporal aspects
    const temporal = this.detectTemporal(lowerText);
    
    // Assess urgency/priority
    const urgency = this.assessUrgency(lowerText);
    
    // Determine verification strategy
    const strategy = this.determineStrategy(claimTypes, entities, temporal);
    
    return {
      claimTypes,
      entities,
      temporal,
      urgency,
      strategy,
      confidence: this.calculateConfidence(claimTypes, entities, temporal),
      metadata: {
        textLength: text.length,
        wordCount: text.split(/\s+/).length,
        containsUrls: /https?:\/\//.test(text),
        containsEmails: /@\w+\.\w+/.test(text)
      }
    };
  }

  /**
   * Detect claim types using pattern matching
   */
  detectClaimTypes(text) {
    const detectedTypes = [];
    
    for (const [type, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          detectedTypes.push({
            type,
            pattern: pattern.source,
            confidence: 0.8
          });
          break; // Only count each type once
        }
      }
    }
    
    return detectedTypes;
  }

  /**
   * Extract entities from text
   */
  extractEntities(text) {
    const entities = {
      companies: [],
      products: [],
      organizations: [],
      people: [],
      locations: [],
      dates: [],
      amounts: []
    };

    // Extract companies
    for (const company of this.entities.TECH_COMPANIES) {
      if (text.includes(company)) {
        entities.companies.push(company);
      }
    }

    // Extract products
    for (const product of this.entities.TECH_PRODUCTS) {
      if (text.includes(product)) {
        entities.products.push(product);
      }
    }

    // Extract organizations
    for (const org of this.entities.GOVERNMENT_ORGS) {
      if (text.includes(org)) {
        entities.organizations.push(org);
      }
    }

    // Extract monetary amounts
    const amountMatches = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|trillion))?/gi);
    if (amountMatches) {
      entities.amounts = amountMatches;
    }

    // Extract dates
    const dateMatches = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi);
    if (dateMatches) {
      entities.dates = dateMatches;
    }

    // Extract potential people names (capitalized words)
    const nameMatches = text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g);
    if (nameMatches) {
      entities.people = nameMatches.slice(0, 5); // Limit to avoid false positives
    }

    return entities;
  }

  /**
   * Detect temporal aspects
   */
  detectTemporal(text) {
    const temporal = {
      timeRelevance: 'UNKNOWN',
      recency: 'UNKNOWN',
      timeIndicators: []
    };

    // Current time indicators
    const currentPatterns = [
      /\b(?:today|now|currently|this\s+(?:morning|afternoon|evening|week|month|year))\b/gi,
      /\b(?:just|recently|lately|breaking|live)\b/gi
    ];

    // Future time indicators
    const futurePatterns = [
      /\b(?:tomorrow|next\s+(?:week|month|year)|upcoming|soon|will|going\s+to)\b/gi,
      /\b(?:expected|planned|scheduled|announced\s+for)\b/gi
    ];

    // Past time indicators
    const pastPatterns = [
      /\b(?:yesterday|last\s+(?:week|month|year)|ago|previously|earlier)\b/gi,
      /\b(?:was|were|had|reported|confirmed)\b/gi
    ];

    // Check for current time indicators
    for (const pattern of currentPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        temporal.timeRelevance = 'CURRENT';
        temporal.recency = 'HIGH';
        temporal.timeIndicators.push(...matches);
      }
    }

    // Check for future time indicators
    for (const pattern of futurePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        temporal.timeRelevance = 'FUTURE';
        temporal.recency = 'MEDIUM';
        temporal.timeIndicators.push(...matches);
      }
    }

    // Check for past time indicators
    for (const pattern of pastPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        temporal.timeRelevance = 'PAST';
        temporal.recency = 'LOW';
        temporal.timeIndicators.push(...matches);
      }
    }

    return temporal;
  }

  /**
   * Assess urgency level
   */
  assessUrgency(text) {
    const urgencyIndicators = [
      /\b(?:urgent|emergency|critical|important|immediate|asap|rush)\b/gi,
      /\b(?:expires|deadline|limited\s+time|act\s+now|hurry)\b/gi,
      /\b(?:breaking|alert|warning|attention)\b/gi
    ];

    let urgencyScore = 0;
    const indicators = [];

    for (const pattern of urgencyIndicators) {
      const matches = text.match(pattern);
      if (matches) {
        urgencyScore += matches.length;
        indicators.push(...matches);
      }
    }

    let level = 'LOW';
    if (urgencyScore >= 3) level = 'HIGH';
    else if (urgencyScore >= 1) level = 'MEDIUM';

    return {
      level,
      score: urgencyScore,
      indicators
    };
  }

  /**
   * Determine verification strategy
   */
  determineStrategy(claimTypes, entities, temporal) {
    const strategy = {
      sourceTypes: [],
      priority: 'MEDIUM',
      methods: [],
      timeout: 30000 // 30 seconds default
    };

    // Determine source types based on claim types
    for (const claim of claimTypes) {
      switch (claim.type) {
        case 'PRODUCT_CLAIM':
          strategy.sourceTypes.push('OFFICIAL_SITE', 'TECH_NEWS', 'SEARCH');
          strategy.methods.push('WEB_SCRAPING', 'API_SEARCH');
          break;
        case 'FINANCIAL_CLAIM':
          strategy.sourceTypes.push('FINANCIAL_API', 'NEWS', 'OFFICIAL_FILINGS');
          strategy.methods.push('API_SEARCH', 'WEB_SCRAPING');
          break;
        case 'NEWS_CLAIM':
          strategy.sourceTypes.push('NEWS_AGENCY', 'SOCIAL_MEDIA', 'OFFICIAL_SOURCES');
          strategy.methods.push('NEWS_API', 'WEB_SCRAPING');
          break;
        case 'HEALTH_CLAIM':
          strategy.sourceTypes.push('MEDICAL_AUTHORITY', 'SCIENTIFIC_JOURNALS', 'NEWS');
          strategy.methods.push('AUTHORITY_CHECK', 'RESEARCH_VERIFICATION');
          break;
        case 'SCAM_PATTERN':
          strategy.sourceTypes.push('SCAM_DATABASE', 'DOMAIN_ANALYSIS', 'PATTERN_MATCHING');
          strategy.methods.push('DOMAIN_CHECK', 'PATTERN_ANALYSIS');
          strategy.priority = 'HIGH';
          break;
      }
    }

    // Adjust priority based on temporal relevance
    if (temporal.recency === 'HIGH') {
      strategy.priority = 'HIGH';
      strategy.timeout = 15000; // Faster timeout for current events
    }

    // Remove duplicates
    strategy.sourceTypes = [...new Set(strategy.sourceTypes)];
    strategy.methods = [...new Set(strategy.methods)];

    return strategy;
  }

  /**
   * Calculate confidence in context detection
   */
  calculateConfidence(claimTypes, entities, temporal) {
    let confidence = 0.3; // Base confidence

    // Increase confidence for detected claim types
    if (claimTypes.length > 0) {
      confidence += 0.3;
    }

    // Increase confidence for entity detection
    const totalEntities = Object.values(entities).flat().length;
    if (totalEntities > 0) {
      confidence += Math.min(0.3, totalEntities * 0.1);
    }

    // Increase confidence for temporal indicators
    if (temporal.timeIndicators.length > 0) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Get human-readable summary of context
   */
  summarizeContext(context) {
    const summary = {
      primaryClaimType: context.claimTypes[0]?.type || 'UNKNOWN',
      keyEntities: Object.entries(context.entities)
        .filter(([_, entities]) => entities.length > 0)
        .map(([type, entities]) => `${type}: ${entities.join(', ')}`)
        .join('; '),
      timeRelevance: context.temporal.timeRelevance,
      urgencyLevel: context.urgency.level,
      recommendedSources: context.strategy.sourceTypes.slice(0, 3).join(', '),
      confidence: (context.confidence * 100).toFixed(1) + '%'
    };

    return summary;
  }
}

module.exports = ContextDetector;