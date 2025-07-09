const express = require('express');
const multer = require('multer');
const cors = require('cors');
const Tesseract = require('tesseract.js');
const puppeteer = require('puppeteer');
const whois = require('whois');
const { promisify } = require('util');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;

// FIXED: Move dotenv to very top
require('dotenv').config();

// FIXED: Import your actual analysis pipeline
const { BullshitDetectorOCRIntegration, BullshitDetectorAPI } = require('./BullshitDetectorIntegration');

const app = express();
const PORT = process.env.PORT || 3001;

// FIXED: Add debug logging for API key
console.log('API Key loaded:', process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO');
console.log('API Key starts with sk-:', process.env.ANTHROPIC_API_KEY?.startsWith('sk-'));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// FIXED: Initialize your analysis pipeline
let bullshitDetector = null;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// FIXED: Enhanced file upload security
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // FIXED: More secure filename generation
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
    cb(null, Date.now() + '-' + Math.random().toString(36).substring(7) + '-' + sanitizedName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: function (req, file, cb) {
    // FIXED: Enhanced file type validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype) && file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// FIXED: Await directory creation
const initializeDirectories = async () => {
  try {
    await fs.mkdir('uploads', { recursive: true });
    console.log('✅ Uploads directory ready');
  } catch (error) {
    console.error('❌ Error creating uploads directory:', error.message);
    process.exit(1);
  }
};

// FIXED: Initialize your analysis pipeline
const initializeAnalysisPipeline = async () => {
  try {
    console.log('🔍 Initializing Bullshit Detector pipeline...');
    bullshitDetector = new BullshitDetectorOCRIntegration();
    console.log('✅ Bullshit Detector pipeline ready');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize analysis pipeline:', error.message);
    console.error('   Falling back to basic analysis');
    return false;
  }
};

// Domain analysis helper
const whoisLookup = promisify(whois.lookup);

const analyzeDomain = async (domain) => {
  try {
    const whoisData = await whoisLookup(domain);
    const registrationDate = extractRegistrationDate(whoisData);
    const isRecent = isRecentlyRegistered(registrationDate);
    
    return {
      domain,
      registrationDate,
      isRecentlyRegistered: isRecent,
      whoisData: whoisData.substring(0, 500)
    };
  } catch (error) {
    return {
      domain,
      error: 'Domain lookup failed',
      isRecentlyRegistered: null
    };
  }
};

const extractRegistrationDate = (whoisData) => {
  const datePatterns = [
    /Creation Date:\s*([^\r\n]+)/i,
    /Created:\s*([^\r\n]+)/i,
    /Registered:\s*([^\r\n]+)/i,
    /Registration Date:\s*([^\r\n]+)/i
  ];
  
  for (const pattern of datePatterns) {
    const match = whoisData.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
};

const isRecentlyRegistered = (dateString) => {
  if (!dateString) return null;
  
  try {
    const registrationDate = new Date(dateString);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    return registrationDate > sixMonthsAgo;
  } catch (error) {
    return null;
  }
};

// FIXED: Enhanced web scraping with better cleanup
const scrapeWebsite = async (url) => {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      timeout: 30000 // FIXED: Add timeout
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // FIXED: Add timeout to page.goto
    await page.goto(url, { 
      waitUntil: 'networkidle0', 
      timeout: 15000 
    });
    
    const content = await page.evaluate(() => {
      return {
        title: document.title,
        text: document.body.innerText.substring(0, 2000),
        links: Array.from(document.links).slice(0, 10).map(link => link.href),
        hasSSL: window.location.protocol === 'https:'
      };
    });
    
    return content;
  } catch (error) {
    return {
      error: `Failed to scrape ${url}: ${error.message}`,
      title: null,
      text: null,
      links: [],
      hasSSL: null
    };
  } finally {
    // FIXED: Ensure browser cleanup
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError.message);
      }
    }
  }
};

// FIXED: Enhanced Claude API helper with better error handling
const analyzeWithClaude = async (prompt) => {
  try {
    console.log('=== CLAUDE API REQUEST ===');
    console.log('API Key present:', !!process.env.ANTHROPIC_API_KEY);
    console.log('API Key starts with sk-:', process.env.ANTHROPIC_API_KEY?.startsWith('sk-'));
    console.log('Prompt length:', prompt.length);
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    console.log('=== CLAUDE API RESPONSE ===');
    console.log('Response type:', typeof response);
    console.log('Response content type:', typeof response.content);
    console.log('Response content length:', response.content?.[0]?.text?.length || 0);
    
    const responseText = response.content[0].text;
    console.log('First 200 chars of response:', responseText.substring(0, 200));
    
    // Check if response looks like JSON
    if (!responseText.trim().startsWith('{')) {
      console.error('❌ Claude response does not start with JSON:');
      console.error('Response:', responseText.substring(0, 500));
      throw new Error('Claude returned non-JSON response');
    }
    
    // Try to parse JSON and catch specific errors
    try {
      JSON.parse(responseText);
      console.log('✅ JSON parsing successful');
    } catch (jsonError) {
      console.error('❌ JSON parsing failed:');
      console.error('JSON Error:', jsonError.message);
      console.error('Response that failed to parse:', responseText);
      throw new Error(`JSON parsing failed: ${jsonError.message}`);
    }
    
    return responseText;
    
  } catch (error) {
    console.error('=== CLAUDE API ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check for specific error types
    if (error.message.includes('authentication')) {
      console.error('❌ AUTHENTICATION ISSUE - Check your API key');
      throw new Error('Claude API authentication failed - check your API key');
    } else if (error.message.includes('rate_limit')) {
      console.error('❌ RATE LIMIT - Too many requests');
      throw new Error('Claude API rate limit exceeded - please try again later');
    } else if (error.message.includes('JSON')) {
      console.error('❌ JSON PARSING ISSUE');
      throw new Error('Claude returned invalid JSON response');
    } else {
      console.error('❌ UNKNOWN CLAUDE ERROR');
      throw new Error('Claude analysis service temporarily unavailable');
    }
  }
};

const testClaudeAPI = async () => {
  try {
    console.log('Testing Claude API...');
    const testResponse = await analyzeWithClaude('Respond with only: {"test": "success"}');
    console.log('✅ Claude API test successful');
    return true;
  } catch (error) {
    console.error('❌ Claude API test failed:', error.message);
    return false;
  }
};

// FIXED: Enhanced scam detection function
function enhancedScamDetection(text) {
  const lowerText = text.toLowerCase();
  const findings = [];
  const questions = [];
  let suspicionScore = 0;

  // ADVANCE FEE SCAM DETECTION
  const freeItems = ['free gold', 'free iphone', 'free laptop', 'free car', 'free money', 'free gift'];
  const costs = ['shipping', 'handling', 'processing fee', 'taxes', 'customs', 'transfer fee'];
  
  const hasFreeItem = freeItems.some(item => lowerText.includes(item));
  const hasCost = costs.some(cost => lowerText.includes(cost)) || /\$\d+/.test(text);
  
  if (hasFreeItem && hasCost) {
    findings.push('🚨 ADVANCE FEE SCAM: "Free" item requiring upfront payment');
    questions.push('Why would you pay for something that\'s supposedly free?');
    suspicionScore += 50;
  }

  // LOTTERY/PRIZE SCAMS  
  const lotteryWords = ['won', 'winner', 'congratulations', 'prize', 'lottery', 'selected'];
  const lotteryCount = lotteryWords.filter(word => lowerText.includes(word)).length;
  
  if (lotteryCount >= 2) {
    findings.push('🎰 LOTTERY SCAM: Claims you won something you never entered');
    questions.push('Did you actually enter this lottery or contest?');
    suspicionScore += 40;
  }

  // AUTHORITY IMPERSONATION + PERSONAL EMAIL
  const authorities = ['government', 'irs', 'microsoft', 'apple', 'amazon', 'ceo', 'director'];
  const personalEmails = ['gmail.com', 'yahoo.com', 'hotmail.com'];
  
  const hasAuthority = authorities.some(auth => lowerText.includes(auth));
  const hasPersonalEmail = personalEmails.some(email => lowerText.includes(email));
  
  if (hasAuthority && hasPersonalEmail) {
    findings.push('👮 IMPERSONATION: Authority figure using personal email');
    questions.push('Why would a government agency or major company use Gmail?');
    suspicionScore += 35;
  }

  // SUSPICIOUS DOMAINS
  const suspiciousDomainPatterns = [
    /\w+-claim\.com/,
    /\w+-rewards?\.com/,
    /\w+-prize\.com/,
    /\w+-winner\.com/
  ];
  
  if (suspiciousDomainPatterns.some(pattern => pattern.test(text))) {
    findings.push('🌐 SUSPICIOUS DOMAIN: Fake reward/claim website pattern');
    questions.push('Why isn\'t this using the official company website?');
    suspicionScore += 30;
  }

  // URGENCY TACTICS
  const urgencyWords = ['urgent', 'expires', 'limited time', 'act now', 'deadline', 'today only'];
  const urgencyCount = urgencyWords.filter(word => lowerText.includes(word)).length;
  
  if (urgencyCount >= 2) {
    findings.push('⏰ PRESSURE TACTICS: Artificial urgency');
    questions.push('Why the rush? Legitimate offers don\'t expire immediately');
    suspicionScore += 25;
  }

  // FINANCIAL LURES
  const moneyPatterns = [/\$[\d,]+/, /\d+\s*million/i, /inheritance/i, /compensation/i];
  if (moneyPatterns.some(pattern => pattern.test(text))) {
    findings.push('💰 FINANCIAL LURE: Large money claims');
    questions.push('Why would strangers give you money?');
    suspicionScore += 20;
  }

  // DETERMINE SUSPICION LEVEL
  let suspicionLevel = 'LOW';
  if (suspicionScore >= 50) {
    suspicionLevel = 'HIGH';
  } else if (suspicionScore >= 25) {
    suspicionLevel = 'MEDIUM';
  }

  const calculations = {
    suspicionScore: suspicionScore,
    totalRedFlags: findings.length,
    riskFactors: findings.map(f => f.split(':')[0]).join(', '),
    recommendation: suspicionLevel === 'HIGH' ? 'DO NOT ENGAGE' : 
                   suspicionLevel === 'MEDIUM' ? 'VERIFY INDEPENDENTLY' : 
                   'BE CAUTIOUS'
  };

  return {
    suspicionLevel,
    findings: findings.length > 0 ? findings : ['No obvious scam patterns detected'],
    questions: questions.length > 0 ? questions : ['Does this seem legitimate to you?'],
    calculations
  };
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    apiKey: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
    analysisPipeline: bullshitDetector ? 'ready' : 'unavailable',
    verificationEngine: global.verificationEngine ? 'initialized' : 'not_initialized'
  });
});

// Verification engine status and statistics
app.get('/api/verification-status', async (req, res) => {
  try {
    if (!global.verificationEngine) {
      return res.json({
        initialized: false,
        message: 'Verification engine not initialized'
      });
    }

    const stats = global.verificationEngine.getStats();
    
    res.json({
      initialized: true,
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get verification status',
      message: error.message
    });
  }
});

// FIXED: NEW - Your sophisticated image analysis endpoint
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    console.log('🔍 Processing image with sophisticated analysis pipeline...');
    console.log('📁 Image path:', req.file.path);

    if (bullshitDetector) {
      try {
        // Use your sophisticated tier-based analysis
        const result = await bullshitDetector.analyzeImageContent(req.file.path);
        
        console.log('✅ Sophisticated analysis completed');
        console.log('📊 Verdict:', result.verdict);
        console.log('📊 Confidence:', result.confidence);

        res.json({
          success: true,
          analysis: result,
          method: 'sophisticated_pipeline',
          timestamp: new Date().toISOString()
        });

      } catch (analysisError) {
        console.error('❌ Sophisticated analysis failed:', analysisError.message);
        
        // Fall back to basic OCR + Claude if sophisticated pipeline fails
        console.log('🔄 Falling back to basic OCR + Claude analysis...');
        const fallbackResult = await fallbackImageAnalysis(req.file.path);
        
        res.json({
          success: true,
          analysis: fallbackResult,
          method: 'fallback_basic',
          note: 'Sophisticated pipeline failed, used fallback method',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Use fallback if sophisticated pipeline not available
      console.log('⚠️  Sophisticated pipeline not available, using fallback...');
      const fallbackResult = await fallbackImageAnalysis(req.file.path);
      
      res.json({
        success: true,
        analysis: fallbackResult,
        method: 'fallback_basic',
        note: 'Sophisticated pipeline not initialized',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Image analysis completely failed:', error);
    res.status(500).json({
      success: false,
      error: 'Image analysis failed',
      message: error.message
    });
  } finally {
    // Clean up uploaded file
    if (req.file) {
      fs.unlink(req.file.path).catch(err => 
        console.error('Error cleaning up file:', err.message)
      );
    }
  }
});

// FIXED: Fallback image analysis function
async function fallbackImageAnalysis(imagePath) {
  try {
    console.log('🔄 Running fallback OCR extraction...');
    
    // Basic OCR extraction
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    
    if (!text || text.trim().length < 10) {
      return {
        verdict: 'MANUAL_REVIEW_REQUIRED',
        confidence: 0,
        evidence: {
          reason: 'OCR extraction failed or insufficient text',
          extractedText: text || 'No text extracted'
        },
        recommendations: [
          '👁️ Please describe what you see in this image',
          '🔍 Look for: sender info, urgent language, money requests'
        ]
      };
    }

    console.log('✅ OCR extracted text:', text.substring(0, 100) + '...');

    // Use enhanced pattern detection
    const enhancedAnalysis = enhancedScamDetection(text);
    
    // Try Claude analysis if available
    try {
      const claudePrompt = `Analyze this text extracted from an image for scam patterns:

"${text}"

Enhanced detection found: ${enhancedAnalysis.suspicionLevel} suspicion level with score ${enhancedAnalysis.calculations.suspicionScore}.

Respond with ONLY valid JSON:
{
  "suspicionLevel": "HIGH|MEDIUM|LOW",
  "findings": ["finding 1", "finding 2"],
  "questions": ["question 1", "question 2"],
  "calculations": {
    "final_verdict": "explanation",
    "confidence_score": 0.95
  }
}`;

      const claudeResponse = await analyzeWithClaude(claudePrompt);
      const claudeAnalysis = JSON.parse(claudeResponse);
      
      return {
        verdict: claudeAnalysis.suspicionLevel === 'HIGH' ? 'DEFINITE_SCAM' : 
                 claudeAnalysis.suspicionLevel === 'MEDIUM' ? 'LIKELY_SCAM' : 'SUSPICIOUS',
        confidence: claudeAnalysis.calculations.confidence_score || 0.5,
        evidence: {
          extractedText: text,
          enhancedDetection: enhancedAnalysis,
          claudeAnalysis: claudeAnalysis
        },
        recommendations: claudeAnalysis.findings || enhancedAnalysis.findings
      };

    } catch (claudeError) {
      console.log('Claude unavailable, using enhanced detection only');
      
      return {
        verdict: enhancedAnalysis.suspicionLevel === 'HIGH' ? 'DEFINITE_SCAM' : 
                 enhancedAnalysis.suspicionLevel === 'MEDIUM' ? 'LIKELY_SCAM' : 'SUSPICIOUS',
        confidence: enhancedAnalysis.calculations.suspicionScore / 100,
        evidence: {
          extractedText: text,
          enhancedDetection: enhancedAnalysis
        },
        recommendations: enhancedAnalysis.findings
      };
    }

  } catch (error) {
    console.error('Fallback analysis failed:', error);
    return {
      verdict: 'ANALYSIS_ERROR',
      confidence: 0,
      evidence: {
        error: error.message
      },
      recommendations: [
        '❌ Analysis failed - please try again',
        '🔍 If this persists, describe the content manually'
      ]
    };
  }
}

// ENHANCED: Real-time verification endpoint with multi-source validation
app.post('/api/analyze-text', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    console.log('🔍 Starting real-time verification analysis...');
    
    // Initialize verification engine if not already done
    if (!global.verificationEngine) {
      console.log('🔄 Initializing verification engine...');
      const VerificationEngine = require('./services/verification/VerificationEngine');
      global.verificationEngine = new VerificationEngine();
      await global.verificationEngine.initialize();
    }
    
    try {
      // Use the new real-time verification system
      const verificationResult = await global.verificationEngine.verify(text, {
        maxSources: 3,
        timeout: 25000,
        bypassCache: req.body.bypassCache || false
      });
      
      if (verificationResult.success) {
        console.log('✅ Real-time verification completed:', verificationResult.verdict);
        
        // Transform result to match expected format
        const transformedResult = {
          suspicionLevel: verificationResult.verdict === 'VERIFIED' ? 'LOW' : 
                         verificationResult.verdict === 'CONTRADICTED' ? 'HIGH' : 'MEDIUM',
          findings: verificationResult.explanation.details || [],
          questions: ['Does this information seem accurate based on current sources?'],
          calculations: {
            confidence_score: verificationResult.confidence,
            final_verdict: verificationResult.explanation.summary,
            verification_sources: verificationResult.sources.results.map(s => s.source),
            consensus: verificationResult.consensus
          }
        };
        
        res.json({
          success: true,
          analysis: transformedResult,
          verificationResult: verificationResult, // Include full verification data
          method: 'real_time_verification',
          timestamp: new Date().toISOString()
        });
        
      } else {
        // Fallback to enhanced detection if verification fails
        console.log('⚠️ Real-time verification failed, using fallback...');
        await handleFallbackAnalysis(text, res, verificationResult.error);
      }
      
    } catch (verificationError) {
      console.error('❌ Real-time verification error:', verificationError.message);
      await handleFallbackAnalysis(text, res, verificationError.message);
    }
    
  } catch (error) {
    console.error('❌ Text analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

// Fallback analysis function
async function handleFallbackAnalysis(text, res, verificationError) {
  console.log('🔄 Using fallback analysis method...');
  
  // ENHANCED SCAM DETECTION FIRST
  const enhancedAnalysis = enhancedScamDetection(text);
  
  // Extract domains/URLs from text for analysis
  const urlRegex = /https?:\/\/([\w.-]+)/gi;
  const domains = [];
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    domains.push(match[1]);
  }
  
  // Analyze domains if found
  const domainAnalyses = await Promise.all(
    domains.slice(0, 3).map(domain => analyzeDomain(domain))
  );
  
  // Enhanced Claude prompt that includes our pre-analysis
  const analysisPrompt = `You are a bullshit detection expert. A preliminary analysis has already been conducted.

Text to analyze: "${text}"

PRELIMINARY ANALYSIS RESULTS:
- Suspicion Level: ${enhancedAnalysis.suspicionLevel}
- Red Flags Found: ${enhancedAnalysis.findings.join('; ')}
- Suspicion Score: ${enhancedAnalysis.calculations.suspicionScore}/100

${domainAnalyses.length > 0 ? `
Domain analysis results:
${domainAnalyses.map(analysis => `
- Domain: ${analysis.domain}
- Recently registered: ${analysis.isRecentlyRegistered}
- Registration date: ${analysis.registrationDate || 'Unknown'}
`).join('')}
` : ''}

Based on the preliminary analysis and domain data, provide your final assessment.

IMPORTANT: If the preliminary analysis shows HIGH suspicion (score >= 50), you should agree unless you have strong evidence otherwise.

Respond with ONLY a valid JSON object in this exact format:
{
  "suspicionLevel": "HIGH|MEDIUM|LOW",
  "findings": ["finding 1", "finding 2", "finding 3"],
  "questions": ["question 1", "question 2", "question 3"],
  "calculations": {
    "preliminary_score": ${enhancedAnalysis.calculations.suspicionScore},
    "final_verdict": "explanation of your assessment",
    "key_red_flags": "${enhancedAnalysis.calculations.riskFactors}"
  }
}

DO NOT include any text outside the JSON.`;

  try {
    const claudeResponse = await analyzeWithClaude(analysisPrompt);
    const claudeAnalysis = JSON.parse(claudeResponse);
    
    // Use the HIGHER suspicion level between our analysis and Claude's
    const finalSuspicionLevel = 
      enhancedAnalysis.suspicionLevel === 'HIGH' || claudeAnalysis.suspicionLevel === 'HIGH' ? 'HIGH' :
      enhancedAnalysis.suspicionLevel === 'MEDIUM' || claudeAnalysis.suspicionLevel === 'MEDIUM' ? 'MEDIUM' : 
      'LOW';
    
    const finalAnalysis = {
      ...claudeAnalysis,
      suspicionLevel: finalSuspicionLevel,
      enhancedDetection: {
        score: enhancedAnalysis.calculations.suspicionScore,
        patterns: enhancedAnalysis.calculations.riskFactors,
        recommendation: enhancedAnalysis.calculations.recommendation
      }
    };
    
    res.json({
      success: true,
      analysis: finalAnalysis,
      domainData: domainAnalyses,
      method: 'fallback_analysis',
      note: `Real-time verification unavailable: ${verificationError}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (claudeError) {
    console.log('Claude unavailable, using enhanced detection only');
    
    // If Claude fails, use our enhanced detection
    res.json({
      success: true,
      analysis: enhancedAnalysis,
      domainData: domainAnalyses,
      method: 'enhanced_detection_only',
      note: 'Analysis completed with local detection (Claude and real-time verification unavailable)',
      timestamp: new Date().toISOString()
    });
  }
}

// Investigation endpoint (keeping your existing logic)
app.post('/api/investigate', async (req, res) => {
  try {
    const { question, answer, context } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }
    
    const urlRegex = /https?:\/\/([\w.-]+)/gi;
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    
    const urls = [];
    const emails = [];
    let match;
    
    while ((match = urlRegex.exec(answer)) !== null) {
      urls.push(match[1]);
    }
    
    while ((match = emailRegex.exec(answer)) !== null) {
      emails.push(match[1]);
    }
    
    const domainAnalyses = await Promise.all(
      [...urls, ...emails.map(email => email.split('@')[1])].slice(0, 3)
      .map(domain => analyzeDomain(domain))
    );
    
    const webScrapingResults = [];
    for (const url of urls.slice(0, 2)) {
      try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const scrapedData = await scrapeWebsite(fullUrl);
        webScrapingResults.push({ url, data: scrapedData });
      } catch (error) {
        webScrapingResults.push({ url, error: error.message });
      }
    }
    
    const investigationPrompt = `You are conducting a follow-up investigation based on a user's answer.

Original question: "${question}"
User's answer: "${answer}"
Context: "${context || 'No additional context'}"

${domainAnalyses.length > 0 ? `
Domain/Email analysis:
${domainAnalyses.map(analysis => `
- Domain: ${analysis.domain}
- Recently registered: ${analysis.isRecentlyRegistered}
- Registration date: ${analysis.registrationDate || 'Unknown'}
`).join('')}
` : ''}

${webScrapingResults.length > 0 ? `
Website analysis:
${webScrapingResults.map(result => `
- URL: ${result.url}
- Title: ${result.data?.title || 'N/A'}
- Has SSL: ${result.data?.hasSSL || 'Unknown'}
- Error: ${result.error || 'None'}
`).join('')}
` : ''}

Based on the user's answer and additional data, provide follow-up analysis.

Respond with ONLY valid JSON:
{
  "suspicionLevel": "HIGH|MEDIUM|LOW",
  "findings": ["specific analysis based on their answer", "verification results", "additional discoveries"],
  "questions": ["follow-up question 1", "follow-up question 2"],
  "calculations": {
    "domain_analysis": "analysis results",
    "verification_status": "verified/unverified/suspicious"
  }
}

DO NOT include any text outside the JSON.`;

    const claudeResponse = await analyzeWithClaude(investigationPrompt);
    const analysis = JSON.parse(claudeResponse);
    
    res.json({
      success: true,
      analysis,
      domainData: domainAnalyses,
      webData: webScrapingResults
    });
    
  } catch (error) {
    console.error('Investigation error:', error);
    res.status(500).json({ 
      error: 'Investigation failed', 
      message: error.message 
    });
  }
});

// FIXED: Enhanced error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  // Clean up any uploaded files
  if (req.file) {
    fs.unlink(req.file.path).catch(err => 
      console.error('Error cleaning up file:', err.message)
    );
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// FIXED: Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  
  // Clean up verification engine
  if (global.verificationEngine) {
    try {
      await global.verificationEngine.cleanup();
    } catch (error) {
      console.error('Error cleaning up verification engine:', error.message);
    }
  }
  
  // Clean up original bullshit detector
  if (bullshitDetector) {
    try {
      await bullshitDetector.terminate();
    } catch (error) {
      console.error('Error terminating bullshit detector:', error.message);
    }
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  
  // Clean up verification engine
  if (global.verificationEngine) {
    try {
      await global.verificationEngine.cleanup();
    } catch (error) {
      console.error('Error cleaning up verification engine:', error.message);
    }
  }
  
  // Clean up original bullshit detector
  if (bullshitDetector) {
    try {
      await bullshitDetector.terminate();
    } catch (error) {
      console.error('Error terminating bullshit detector:', error.message);
    }
  }
  
  process.exit(0);
});

// FIXED: Start server with proper initialization
const startServer = async () => {
  try {
    await initializeDirectories();
    
    // Validate environment
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY not found in environment');
      process.exit(1);
    }
    
    if (!process.env.ANTHROPIC_API_KEY.startsWith('sk-')) {
      console.error('❌ ANTHROPIC_API_KEY appears to be invalid');
      process.exit(1);
    }
    
    // Initialize your sophisticated analysis pipeline
    console.log('🔍 Initializing sophisticated analysis pipeline...');
    const pipelineReady = await initializeAnalysisPipeline();
    
    // Test Claude API before starting server
    console.log('🔍 Testing Claude API connection...');
    const claudeWorks = await testClaudeAPI();
    if (!claudeWorks) {
      console.error('❌ Claude API test failed - server may not work properly');
      console.log('   Starting anyway, but Claude features will be disabled');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
      console.log(`🔍 Analysis Pipeline: ${pipelineReady ? 'Ready' : 'Fallback Mode'}`);
      console.log(`✅ Claude API: ${claudeWorks ? 'Working' : 'Failed'}`);
      console.log(`📸 Image Analysis: POST /api/analyze-image`);
      console.log(`📝 Text Analysis: POST /api/analyze-text`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer().catch(console.error);

module.exports = app;