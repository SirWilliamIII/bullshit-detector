/**
 * Advanced web scraper with anti-detection, content extraction, and intelligent parsing
 * Handles modern web applications with JavaScript rendering
 */
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class AdvancedScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      userAgents: options.userAgents || [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
      ],
      delay: options.delay || 1000,
      retryAttempts: options.retryAttempts || 3,
      respectRobots: options.respectRobots !== false,
      blockResources: options.blockResources !== false
    };

    this.browser = null;
    this.requestCounts = new Map();
    this.lastRequests = new Map();
    this.robotsCache = new Map();
  }

  /**
   * Initialize browser instance
   */
  async initialize() {
    if (this.browser) return;

    try {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-blink-features=AutomationControlled'
        ],
        timeout: this.options.timeout
      });

      console.log('🤖 Advanced scraper initialized');
    } catch (error) {
      console.error('❌ Failed to initialize scraper:', error.message);
      throw error;
    }
  }

  /**
   * Close browser instance
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🤖 Advanced scraper closed');
    }
  }

  /**
   * Check robots.txt for a domain
   */
  async checkRobots(url) {
    if (!this.options.respectRobots) return true;

    try {
      const domain = new URL(url).origin;
      
      if (this.robotsCache.has(domain)) {
        return this.robotsCache.get(domain);
      }

      const robotsUrl = `${domain}/robots.txt`;
      const response = await fetch(robotsUrl);
      
      if (!response.ok) {
        this.robotsCache.set(domain, true);
        return true;
      }

      const robotsContent = await response.text();
      const allowed = this.parseRobots(robotsContent, url);
      
      this.robotsCache.set(domain, allowed);
      return allowed;
    } catch (error) {
      console.warn('⚠️ Failed to check robots.txt:', error.message);
      return true; // Allow if robots.txt check fails
    }
  }

  /**
   * Parse robots.txt content
   */
  parseRobots(robotsContent, url) {
    const lines = robotsContent.split('\n');
    const pathname = new URL(url).pathname;
    
    let userAgentMatch = false;
    let disallowed = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.split(':')[1].trim();
        userAgentMatch = agent === '*' || agent === 'googlebot';
      } else if (userAgentMatch && trimmed.startsWith('disallow:')) {
        const path = trimmed.split(':')[1].trim();
        if (path === '/' || pathname.startsWith(path)) {
          disallowed = true;
        }
      }
    }

    return !disallowed;
  }

  /**
   * Enforce rate limiting per domain
   */
  async enforceRateLimit(domain) {
    const now = Date.now();
    const lastRequest = this.lastRequests.get(domain) || 0;
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest < this.options.delay) {
      const delay = this.options.delay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequests.set(domain, Date.now());
    
    const count = this.requestCounts.get(domain) || 0;
    this.requestCounts.set(domain, count + 1);
  }

  /**
   * Get random user agent
   */
  getRandomUserAgent() {
    const agents = this.options.userAgents;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * Main scraping method
   */
  async scrape(url, options = {}) {
    const domain = new URL(url).hostname;
    
    // Check robots.txt
    const robotsAllowed = await this.checkRobots(url);
    if (!robotsAllowed) {
      throw new Error('Blocked by robots.txt');
    }

    // Enforce rate limiting
    await this.enforceRateLimit(domain);

    // Initialize browser if needed
    if (!this.browser) {
      await this.initialize();
    }

    let attempt = 0;
    let lastError;

    while (attempt < this.options.retryAttempts) {
      try {
        const result = await this.scrapeWithBrowser(url, options);
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt < this.options.retryAttempts) {
          console.warn(`⚠️ Scraping attempt ${attempt} failed for ${url}: ${error.message}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`Failed to scrape ${url} after ${this.options.retryAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Scrape with browser instance
   */
  async scrapeWithBrowser(url, options = {}) {
    const page = await this.browser.newPage();
    
    try {
      // Set random user agent
      await page.setUserAgent(this.getRandomUserAgent());
      
      // Set viewport
      await page.setViewport({ 
        width: 1366, 
        height: 768,
        deviceScaleFactor: 1
      });

      // Block unnecessary resources for speed
      if (this.options.blockResources) {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const resourceType = req.resourceType();
          if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });
      }

      // Set additional headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });

      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Extract content
      const content = await this.extractContent(page, url, options);
      
      return {
        success: true,
        url,
        content,
        metadata: {
          status: response.status(),
          headers: response.headers(),
          timestamp: new Date().toISOString(),
          userAgent: page.evaluate(() => navigator.userAgent)
        }
      };

    } finally {
      await page.close();
    }
  }

  /**
   * Extract content from page
   */
  async extractContent(page, url, options = {}) {
    const content = await page.evaluate((extractOptions) => {
      const result = {
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname,
        hasSSL: window.location.protocol === 'https:',
        description: null,
        author: null,
        publishDate: null,
        modifiedDate: null,
        mainContent: null,
        links: [],
        images: [],
        structuredData: [],
        socialMedia: {},
        metadata: {}
      };

      // Extract meta tags
      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach(tag => {
        const name = tag.getAttribute('name') || tag.getAttribute('property');
        const content = tag.getAttribute('content');
        
        if (name && content) {
          result.metadata[name] = content;
          
          // Extract specific meta information
          if (name === 'description') result.description = content;
          if (name === 'author') result.author = content;
          if (name === 'article:published_time') result.publishDate = content;
          if (name === 'article:modified_time') result.modifiedDate = content;
        }
      });

      // Extract structured data (JSON-LD)
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          result.structuredData.push(data);
        } catch (e) {
          // Ignore malformed JSON-LD
        }
      });

      // Extract main content
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.main-content',
        '.post-content',
        '.entry-content',
        '#content'
      ];

      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          result.mainContent = element.innerText.trim();
          break;
        }
      }

      // Fallback to body content
      if (!result.mainContent) {
        const bodyText = document.body.innerText;
        result.mainContent = bodyText.substring(0, 5000); // Limit to 5000 chars
      }

      // Extract links
      const links = document.querySelectorAll('a[href]');
      result.links = Array.from(links)
        .slice(0, 20) // Limit links
        .map(link => ({
          href: link.href,
          text: link.innerText.trim(),
          title: link.title
        }))
        .filter(link => link.href && link.text);

      // Extract images
      const images = document.querySelectorAll('img[src]');
      result.images = Array.from(images)
        .slice(0, 10) // Limit images
        .map(img => ({
          src: img.src,
          alt: img.alt,
          title: img.title
        }))
        .filter(img => img.src);

      // Extract social media mentions
      const socialPatterns = {
        twitter: /(?:twitter\.com|@\w+)/gi,
        facebook: /facebook\.com/gi,
        instagram: /instagram\.com/gi,
        linkedin: /linkedin\.com/gi
      };

      for (const [platform, pattern] of Object.entries(socialPatterns)) {
        const matches = result.mainContent.match(pattern);
        if (matches) {
          result.socialMedia[platform] = matches.length;
        }
      }

      return result;
    }, options);

    return content;
  }

  /**
   * Extract specific content based on domain
   */
  async extractDomainSpecificContent(url, content) {
    const domain = new URL(url).hostname;
    
    // Apple-specific extraction
    if (domain.includes('apple.com')) {
      return this.extractAppleContent(content);
    }
    
    // News site extraction
    if (domain.includes('reuters.com') || domain.includes('ap.org') || domain.includes('bbc.com')) {
      return this.extractNewsContent(content);
    }
    
    // Reddit extraction
    if (domain.includes('reddit.com')) {
      return this.extractRedditContent(content);
    }
    
    // Generic extraction
    return this.extractGenericContent(content);
  }

  /**
   * Extract Apple-specific content
   */
  extractAppleContent(content) {
    // Look for product announcements, specifications, pricing
    const productInfo = {
      isProductPage: content.url.includes('/iphone/') || content.url.includes('/ipad/') || content.url.includes('/mac/'),
      productName: null,
      price: null,
      availability: null,
      specifications: []
    };

    // Extract product name from title
    const productMatch = content.title.match(/(iPhone|iPad|Mac|Apple Watch|AirPods)\s+([^-]+)/i);
    if (productMatch) {
      productInfo.productName = productMatch[0].trim();
    }

    // Extract price
    const priceMatch = content.mainContent.match(/\$[\d,]+/);
    if (priceMatch) {
      productInfo.price = priceMatch[0];
    }

    // Extract availability
    const availabilityMatch = content.mainContent.match(/Available\s+([^.]+)/i);
    if (availabilityMatch) {
      productInfo.availability = availabilityMatch[1];
    }

    return {
      ...content,
      domainSpecific: {
        type: 'APPLE_PRODUCT',
        ...productInfo
      }
    };
  }

  /**
   * Extract news content
   */
  extractNewsContent(content) {
    const newsInfo = {
      isNewsArticle: true,
      headline: content.title,
      byline: content.author,
      publishDate: content.publishDate,
      summary: content.description,
      wordCount: content.mainContent ? content.mainContent.split(/\s+/).length : 0
    };

    return {
      ...content,
      domainSpecific: {
        type: 'NEWS_ARTICLE',
        ...newsInfo
      }
    };
  }

  /**
   * Extract Reddit content
   */
  extractRedditContent(content) {
    const redditInfo = {
      isRedditPost: true,
      subreddit: null,
      postTitle: content.title,
      commentCount: 0
    };

    // Extract subreddit
    const subredditMatch = content.url.match(/\/r\/([^\/]+)/);
    if (subredditMatch) {
      redditInfo.subreddit = subredditMatch[1];
    }

    // Extract comment count
    const commentMatch = content.mainContent.match(/(\d+)\s+comments/i);
    if (commentMatch) {
      redditInfo.commentCount = parseInt(commentMatch[1]);
    }

    return {
      ...content,
      domainSpecific: {
        type: 'REDDIT_POST',
        ...redditInfo
      }
    };
  }

  /**
   * Extract generic content
   */
  extractGenericContent(content) {
    return {
      ...content,
      domainSpecific: {
        type: 'GENERIC',
        contentType: this.guessContentType(content),
        keyPhrases: this.extractKeyPhrases(content.mainContent)
      }
    };
  }

  /**
   * Guess content type
   */
  guessContentType(content) {
    const text = content.mainContent.toLowerCase();
    
    if (text.includes('product') || text.includes('price') || text.includes('buy')) {
      return 'PRODUCT_PAGE';
    }
    if (text.includes('news') || text.includes('reported') || text.includes('according')) {
      return 'NEWS_ARTICLE';
    }
    if (text.includes('blog') || text.includes('post') || text.includes('author')) {
      return 'BLOG_POST';
    }
    
    return 'GENERIC';
  }

  /**
   * Extract key phrases
   */
  extractKeyPhrases(text) {
    if (!text) return [];
    
    // Simple key phrase extraction
    const words = text.toLowerCase().split(/\s+/);
    const phrases = [];
    
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = words.slice(i, i + 2).join(' ');
      phrases.push(phrase);
    }
    
    // Count phrase frequency
    const phraseCount = phrases.reduce((acc, phrase) => {
      acc[phrase] = (acc[phrase] || 0) + 1;
      return acc;
    }, {});
    
    // Return top phrases
    return Object.entries(phraseCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([phrase]) => phrase);
  }

  /**
   * Get scraper statistics
   */
  getStats() {
    return {
      totalRequests: Array.from(this.requestCounts.values()).reduce((sum, count) => sum + count, 0),
      requestsByDomain: Object.fromEntries(this.requestCounts),
      robotsCacheSize: this.robotsCache.size,
      browserActive: !!this.browser
    };
  }
}

module.exports = AdvancedScraper;