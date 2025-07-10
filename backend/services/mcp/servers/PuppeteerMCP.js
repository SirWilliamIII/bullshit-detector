/**
 * Puppeteer MCP Server
 * Provides browser automation, web scraping, and testing capabilities
 */
const BaseMCPServer = require('../BaseMCPServer');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class PuppeteerMCP extends BaseMCPServer {
  constructor(config = {}) {
    super({
      name: 'Puppeteer MCP',
      version: '1.0.0',
      description: 'Browser automation, web scraping, and testing capabilities',
      capabilities: [
        'web_automation',
        'scrape_page',
        'take_screenshot',
        'generate_pdf',
        'fill_form',
        'click_element',
        'wait_for_element',
        'get_page_content',
        'execute_javascript',
        'monitor_network',
        'test_performance',
        'check_accessibility',
        'extract_links',
        'download_file'
      ]
    });

    this.config = {
      headless: config.headless !== false,
      devtools: config.devtools || false,
      slowMo: config.slowMo || 0,
      timeout: config.timeout || 30000,
      viewport: config.viewport || { width: 1366, height: 768 },
      userAgent: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...config
    };

    this.browser = null;
    this.pages = new Map();
    this.screenshotCounter = 0;
  }

  /**
   * Initialize Puppeteer browser
   */
  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        devtools: this.config.devtools,
        slowMo: this.config.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-default-apps'
        ],
        timeout: this.config.timeout
      });

      this.log('info', 'Puppeteer browser launched successfully');
      await super.initialize();
    } catch (error) {
      throw new Error(`Puppeteer initialization failed: ${error.message}`);
    }
  }

  /**
   * Execute Puppeteer capability
   */
  async execute(capability, parameters = {}) {
    if (!this.browser) {
      throw new Error('Puppeteer browser not initialized');
    }

    return this.executeWithMetrics(capability, parameters, async (cap, params) => {
      switch (cap) {
        case 'web_automation':
        case 'scrape_page':
          return await this.scrapePage(params);
        case 'take_screenshot':
          return await this.takeScreenshot(params);
        case 'generate_pdf':
          return await this.generatePdf(params);
        case 'fill_form':
          return await this.fillForm(params);
        case 'click_element':
          return await this.clickElement(params);
        case 'wait_for_element':
          return await this.waitForElement(params);
        case 'get_page_content':
          return await this.getPageContent(params);
        case 'execute_javascript':
          return await this.executeJavaScript(params);
        case 'monitor_network':
          return await this.monitorNetwork(params);
        case 'test_performance':
          return await this.testPerformance(params);
        case 'check_accessibility':
          return await this.checkAccessibility(params);
        case 'extract_links':
          return await this.extractLinks(params);
        case 'download_file':
          return await this.downloadFile(params);
        default:
          throw new Error(`Unknown capability: ${cap}`);
      }
    });
  }

  /**
   * Scrape page content
   */
  async scrapePage(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      selectors: { type: 'object', required: false },
      wait_for: { type: 'string', required: false },
      timeout: { type: 'number', required: false },
      extract_images: { type: 'boolean', required: false },
      extract_links: { type: 'boolean', required: false }
    });

    const page = await this.createPage();
    
    try {
      // Navigate to page
      await page.goto(params.url, {
        waitUntil: 'networkidle2',
        timeout: params.timeout || this.config.timeout
      });

      // Wait for specific element if specified
      if (params.wait_for) {
        await page.waitForSelector(params.wait_for, {
          timeout: params.timeout || this.config.timeout
        });
      }

      // Extract page content
      const content = await page.evaluate((options) => {
        const result = {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText,
          html: document.documentElement.outerHTML,
          meta: {}
        };

        // Extract meta tags
        const metaTags = document.querySelectorAll('meta');
        metaTags.forEach(tag => {
          const name = tag.getAttribute('name') || tag.getAttribute('property');
          const content = tag.getAttribute('content');
          if (name && content) {
            result.meta[name] = content;
          }
        });

        // Extract images if requested
        if (options.extract_images) {
          result.images = Array.from(document.querySelectorAll('img')).map(img => ({
            src: img.src,
            alt: img.alt,
            title: img.title,
            width: img.width,
            height: img.height
          }));
        }

        // Extract links if requested
        if (options.extract_links) {
          result.links = Array.from(document.querySelectorAll('a[href]')).map(link => ({
            href: link.href,
            text: link.innerText.trim(),
            title: link.title
          }));
        }

        // Extract custom selectors
        if (options.selectors) {
          result.custom = {};
          for (const [key, selector] of Object.entries(options.selectors)) {
            try {
              const elements = document.querySelectorAll(selector);
              result.custom[key] = Array.from(elements).map(el => ({
                text: el.innerText,
                html: el.innerHTML,
                attributes: Object.fromEntries(
                  Array.from(el.attributes).map(attr => [attr.name, attr.value])
                )
              }));
            } catch (error) {
              result.custom[key] = { error: error.message };
            }
          }
        }

        return result;
      }, {
        extract_images: params.extract_images,
        extract_links: params.extract_links,
        selectors: params.selectors
      });

      return {
        url: params.url,
        content,
        success: true,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      selector: { type: 'string', required: false },
      fullPage: { type: 'boolean', required: false },
      format: { type: 'string', required: false },
      quality: { type: 'number', required: false },
      clip: { type: 'object', required: false },
      save_path: { type: 'string', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const screenshotOptions = {
        fullPage: params.fullPage || false,
        type: params.format || 'png',
        encoding: 'base64'
      };

      if (params.quality && params.format === 'jpeg') {
        screenshotOptions.quality = params.quality;
      }

      if (params.clip) {
        screenshotOptions.clip = params.clip;
      }

      let screenshot;

      if (params.selector) {
        // Screenshot specific element
        const element = await page.$(params.selector);
        if (!element) {
          throw new Error(`Element not found: ${params.selector}`);
        }
        screenshot = await element.screenshot(screenshotOptions);
      } else {
        // Screenshot entire page
        screenshot = await page.screenshot(screenshotOptions);
      }

      // Save to file if path specified
      if (params.save_path) {
        await fs.writeFile(params.save_path, screenshot, 'base64');
      }

      this.screenshotCounter++;

      return {
        url: params.url,
        screenshot: screenshot,
        format: screenshotOptions.type,
        saved_path: params.save_path,
        selector: params.selector,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Generate PDF
   */
  async generatePdf(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      format: { type: 'string', required: false },
      landscape: { type: 'boolean', required: false },
      margin: { type: 'object', required: false },
      save_path: { type: 'string', required: false },
      print_background: { type: 'boolean', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const pdfOptions = {
        format: params.format || 'A4',
        landscape: params.landscape || false,
        printBackground: params.print_background !== false,
        margin: params.margin || { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
      };

      const pdf = await page.pdf(pdfOptions);

      // Save to file if path specified
      if (params.save_path) {
        await fs.writeFile(params.save_path, pdf);
      }

      return {
        url: params.url,
        pdf: pdf.toString('base64'),
        format: pdfOptions.format,
        saved_path: params.save_path,
        size: pdf.length,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Fill form
   */
  async fillForm(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      form_data: { type: 'object', required: true },
      submit: { type: 'boolean', required: false },
      submit_selector: { type: 'string', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const results = [];

      // Fill form fields
      for (const [selector, value] of Object.entries(params.form_data)) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          
          const element = await page.$(selector);
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          const inputType = await element.evaluate(el => el.type);

          if (tagName === 'select') {
            await page.select(selector, value);
          } else if (inputType === 'checkbox' || inputType === 'radio') {
            if (value) {
              await page.check(selector);
            } else {
              await page.uncheck(selector);
            }
          } else {
            await page.type(selector, value.toString(), { delay: 50 });
          }

          results.push({
            selector,
            value,
            success: true,
            type: `${tagName}${inputType ? `[${inputType}]` : ''}`
          });

        } catch (error) {
          results.push({
            selector,
            value,
            success: false,
            error: error.message
          });
        }
      }

      // Submit form if requested
      let submitResult = null;
      if (params.submit) {
        try {
          const submitSelector = params.submit_selector || 'input[type="submit"], button[type="submit"], button:not([type])';
          await page.click(submitSelector);
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          submitResult = {
            success: true,
            url: page.url()
          };
        } catch (error) {
          submitResult = {
            success: false,
            error: error.message
          };
        }
      }

      return {
        url: params.url,
        form_fields: results,
        submit_result: submitResult,
        total_fields: Object.keys(params.form_data).length,
        successful_fields: results.filter(r => r.success).length,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Click element
   */
  async clickElement(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      selector: { type: 'string', required: true },
      wait_for_navigation: { type: 'boolean', required: false },
      delay: { type: 'number', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });
      await page.waitForSelector(params.selector);

      if (params.delay) {
        await new Promise(resolve => setTimeout(resolve, params.delay));
      }

      await page.click(params.selector);

      let navigationResult = null;
      if (params.wait_for_navigation) {
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          navigationResult = {
            success: true,
            new_url: page.url()
          };
        } catch (error) {
          navigationResult = {
            success: false,
            error: error.message
          };
        }
      }

      return {
        url: params.url,
        selector: params.selector,
        clicked: true,
        navigation: navigationResult,
        current_url: page.url(),
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Wait for element
   */
  async waitForElement(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      selector: { type: 'string', required: true },
      timeout: { type: 'number', required: false },
      visible: { type: 'boolean', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const waitOptions = {
        timeout: params.timeout || this.config.timeout
      };

      if (params.visible) {
        waitOptions.visible = true;
      }

      const startTime = Date.now();
      await page.waitForSelector(params.selector, waitOptions);
      const waitTime = Date.now() - startTime;

      const element = await page.$(params.selector);
      const isVisible = await element.isIntersectingViewport();
      const boundingBox = await element.boundingBox();

      return {
        url: params.url,
        selector: params.selector,
        found: true,
        wait_time: waitTime,
        visible: isVisible,
        bounding_box: boundingBox,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Get page content
   */
  async getPageContent(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      include_html: { type: 'boolean', required: false },
      include_resources: { type: 'boolean', required: false }
    });

    const page = await this.createPage();
    
    try {
      // Monitor resources if requested
      const resources = [];
      if (params.include_resources) {
        page.on('response', response => {
          resources.push({
            url: response.url(),
            status: response.status(),
            content_type: response.headers()['content-type'],
            size: response.headers()['content-length']
          });
        });
      }

      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const content = await page.evaluate((includeHtml) => {
        const result = {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText,
          links: Array.from(document.querySelectorAll('a[href]')).length,
          images: Array.from(document.querySelectorAll('img[src]')).length,
          forms: Array.from(document.querySelectorAll('form')).length,
          scripts: Array.from(document.querySelectorAll('script')).length,
          stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).length
        };

        if (includeHtml) {
          result.html = document.documentElement.outerHTML;
        }

        return result;
      }, params.include_html);

      if (params.include_resources) {
        content.resources = resources;
      }

      return {
        url: params.url,
        content,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Execute JavaScript
   */
  async executeJavaScript(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      script: { type: 'string', required: true },
      args: { type: 'object', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const result = await page.evaluate((script, args) => {
        // Create a function from the script string
        const func = new Function('args', script);
        return func(args);
      }, params.script, params.args || {});

      return {
        url: params.url,
        script: params.script,
        result,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Monitor network requests
   */
  async monitorNetwork(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      duration: { type: 'number', required: false },
      filter: { type: 'string', required: false }
    });

    const page = await this.createPage();
    const requests = [];
    const responses = [];

    try {
      // Monitor requests
      page.on('request', request => {
        const data = {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          post_data: request.postData(),
          timestamp: new Date().toISOString()
        };

        if (!params.filter || request.url().includes(params.filter)) {
          requests.push(data);
        }
      });

      // Monitor responses
      page.on('response', response => {
        const data = {
          url: response.url(),
          status: response.status(),
          headers: response.headers(),
          size: response.headers()['content-length'],
          timestamp: new Date().toISOString()
        };

        if (!params.filter || response.url().includes(params.filter)) {
          responses.push(data);
        }
      });

      await page.goto(params.url, { waitUntil: 'networkidle2' });

      // Monitor for additional duration if specified
      if (params.duration) {
        await new Promise(resolve => setTimeout(resolve, params.duration));
      }

      return {
        url: params.url,
        monitoring_duration: params.duration || 0,
        filter: params.filter,
        requests,
        responses,
        summary: {
          total_requests: requests.length,
          total_responses: responses.length,
          failed_requests: responses.filter(r => r.status >= 400).length
        },
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Test page performance
   */
  async testPerformance(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      runs: { type: 'number', required: false }
    });

    const runs = params.runs || 1;
    const results = [];

    for (let i = 0; i < runs; i++) {
      const page = await this.createPage();
      
      try {
        const startTime = Date.now();
        
        await page.goto(params.url, { waitUntil: 'networkidle2' });
        
        const loadTime = Date.now() - startTime;
        
        const metrics = await page.metrics();
        const performance = await page.evaluate(() => {
          return JSON.parse(JSON.stringify(performance.timing));
        });

        results.push({
          run: i + 1,
          load_time: loadTime,
          metrics,
          performance_timing: performance
        });

      } finally {
        await this.closePage(page);
      }
    }

    // Calculate averages
    const avgLoadTime = results.reduce((sum, r) => sum + r.load_time, 0) / results.length;

    return {
      url: params.url,
      runs,
      results,
      average_load_time: Math.round(avgLoadTime),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check accessibility
   */
  async checkAccessibility(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const accessibility = await page.evaluate(() => {
        const issues = [];
        
        // Check for missing alt text
        const images = document.querySelectorAll('img:not([alt])');
        if (images.length > 0) {
          issues.push({
            type: 'missing_alt_text',
            count: images.length,
            description: 'Images without alt text'
          });
        }

        // Check for missing form labels
        const inputs = document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
        const unlabeledInputs = Array.from(inputs).filter(input => {
          const label = document.querySelector(`label[for="${input.id}"]`);
          return !label && input.type !== 'hidden';
        });
        
        if (unlabeledInputs.length > 0) {
          issues.push({
            type: 'missing_form_labels',
            count: unlabeledInputs.length,
            description: 'Form inputs without proper labels'
          });
        }

        // Check heading structure
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const headingLevels = Array.from(headings).map(h => parseInt(h.tagName[1]));
        
        let headingIssues = 0;
        for (let i = 1; i < headingLevels.length; i++) {
          if (headingLevels[i] - headingLevels[i-1] > 1) {
            headingIssues++;
          }
        }
        
        if (headingIssues > 0) {
          issues.push({
            type: 'heading_structure',
            count: headingIssues,
            description: 'Improper heading hierarchy'
          });
        }

        return {
          issues,
          summary: {
            total_issues: issues.length,
            images_count: document.querySelectorAll('img').length,
            forms_count: document.querySelectorAll('form').length,
            headings_count: headings.length
          }
        };
      });

      return {
        url: params.url,
        accessibility,
        score: Math.max(0, 100 - (accessibility.issues.length * 10)),
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Extract all links
   */
  async extractLinks(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      internal_only: { type: 'boolean', required: false },
      check_status: { type: 'boolean', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const links = await page.evaluate((baseUrl, internalOnly) => {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const baseDomain = new URL(baseUrl).hostname;
        
        return allLinks.map(link => {
          const href = link.href;
          const isInternal = new URL(href).hostname === baseDomain;
          
          if (internalOnly && !isInternal) {
            return null;
          }
          
          return {
            href,
            text: link.innerText.trim(),
            title: link.title,
            internal: isInternal
          };
        }).filter(Boolean);
      }, params.url, params.internal_only);

      // Check link status if requested
      if (params.check_status) {
        for (const link of links.slice(0, 20)) { // Limit to first 20 links
          try {
            const response = await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 5000 });
            link.status = response.status();
            link.ok = response.ok();
          } catch (error) {
            link.status = 'error';
            link.error = error.message;
          }
        }
      }

      return {
        url: params.url,
        links,
        total: links.length,
        internal: links.filter(l => l.internal).length,
        external: links.filter(l => !l.internal).length,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Download file
   */
  async downloadFile(params) {
    this.validateParameters(params, {
      url: { type: 'string', required: true },
      save_path: { type: 'string', required: true },
      click_selector: { type: 'string', required: false }
    });

    const page = await this.createPage();
    
    try {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      // Set up download
      const client = await page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.dirname(params.save_path)
      });

      let downloadStarted = false;
      client.on('Page.downloadProgress', (event) => {
        if (event.state === 'inProgress') {
          downloadStarted = true;
        }
      });

      if (params.click_selector) {
        await page.click(params.click_selector);
      }

      // Wait for download to start
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Download did not start within timeout'));
        }, 10000);

        const checkDownload = setInterval(() => {
          if (downloadStarted) {
            clearInterval(checkDownload);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });

      return {
        url: params.url,
        save_path: params.save_path,
        downloaded: true,
        click_selector: params.click_selector,
        timestamp: new Date().toISOString()
      };

    } finally {
      await this.closePage(page);
    }
  }

  /**
   * Create a new page with default settings
   */
  async createPage() {
    const page = await this.browser.newPage();
    
    await page.setViewport(this.config.viewport);
    await page.setUserAgent(this.config.userAgent);
    
    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);
    
    // Block ads and trackers
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const blockedDomains = [
        'googlesyndication.com',
        'googletagmanager.com',
        'doubleclick.net',
        'facebook.com/tr',
        'google-analytics.com'
      ];
      
      if (blockedDomains.some(domain => request.url().includes(domain))) {
        request.abort();
      } else {
        request.continue();
      }
    });

    const pageId = `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.pages.set(pageId, page);
    
    return page;
  }

  /**
   * Close page and clean up
   */
  async closePage(page) {
    try {
      // Find and remove page from tracking
      for (const [id, trackedPage] of this.pages.entries()) {
        if (trackedPage === page) {
          this.pages.delete(id);
          break;
        }
      }
      
      await page.close();
    } catch (error) {
      this.log('warn', `Error closing page: ${error.message}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.browser) {
        return {
          healthy: false,
          error: 'Browser not initialized'
        };
      }

      // Test page creation
      const page = await this.createPage();
      await this.closePage(page);
      
      return {
        healthy: true,
        browser_connected: this.browser.isConnected(),
        pages_open: this.pages.size,
        screenshots_taken: this.screenshotCounter,
        ...await super.healthCheck()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Close all open pages
    for (const [id, page] of this.pages.entries()) {
      try {
        await page.close();
      } catch (error) {
        this.log('warn', `Error closing page ${id}: ${error.message}`);
      }
    }
    this.pages.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.log('info', 'Puppeteer browser closed');
    }

    await super.cleanup();
  }
}

module.exports = PuppeteerMCP;