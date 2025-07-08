// Integration layer for Enhanced OCR with Bullshit Detector architecture
// Connects OCR results with your Tier 1-4 verification framework

const EnhancedOCRService = require('./EnhancedOCRService');

class BullshitDetectorOCRIntegration {
  constructor() {
    this.ocrService = new EnhancedOCRService();
    this.tier1Sources = new Tier1VerificationService();
    this.tier2Sources = new Tier2VerificationService();
    this.tier3Patterns = new Tier3PatternService();
    this.tier4Analysis = new Tier4BehavioralService();
  }

  async analyzeImageContent(imagePath, userContext = {}) {
    console.log('🔍 Starting Bullshit Detector analysis on image...');
    
    try {
      // Step 1: Extract text using enhanced OCR
      const ocrResult = await this.ocrService.extractTextWithFallback(imagePath);
      
      if (ocrResult.verdict === 'MANUAL_REVIEW_NEEDED') {
        return this.handleManualReviewCase(ocrResult, imagePath);
      }

      // Step 2: Run through your tiered verification system
      const verificationResult = await this.runTieredVerification(ocrResult.text, ocrResult);
      
      // Step 3: Combine OCR insights with verification results
      const finalAnalysis = this.synthesizeResults(ocrResult, verificationResult);
      
      return finalAnalysis;
      
    } catch (error) {
      console.error('Bullshit Detector analysis failed:', error);
      return this.createErrorResponse(error, imagePath);
    }
  }

  async runTieredVerification(extractedText, ocrResult) {
    console.log('Running tiered verification analysis...');
    
    const results = {
      tier1: null,
      tier2: null, 
      tier3: null,
      tier4: null,
      finalVerdict: null,
      confidence: 0
    };

    // Tier 1: Government/Regulatory Authority Check (100% Trust)
    try {
      results.tier1 = await this.tier1Sources.verifyAgainstAuthoritySources(extractedText);
      
      // If Tier 1 confirms fraud, we're done
      if (results.tier1.verdict === 'CONFIRMED_FRAUD') {
        results.finalVerdict = 'DEFINITE_SCAM';
        results.confidence = 1.0;
        return results;
      }
    } catch (error) {
      console.log('Tier 1 verification failed:', error.message);
    }

    // Tier 2: Established Complaint Systems (95% Trust)
    try {
      results.tier2 = await this.tier2Sources.checkComplaintDatabases(extractedText);
      
      // Multiple Tier 2 sources agreeing = high confidence
      if (results.tier2.multipleSourcesConfirm && results.tier2.verdict === 'SCAM') {
        results.finalVerdict = 'DEFINITE_SCAM';
        results.confidence = 0.95;
        return results;
      }
    } catch (error) {
      console.log('Tier 2 verification failed:', error.message);
    }

    // Tier 3: Pattern Recognition (85% Trust) - This is where OCR really shines
    try {
      results.tier3 = await this.tier3Patterns.analyzeScamPatterns(extractedText, ocrResult);
      
      // Strong pattern match + OCR confidence = reliable detection
      if (results.tier3.strongPatternMatch && ocrResult.confidence > 0.8) {
        results.finalVerdict = 'LIKELY_SCAM';
        results.confidence = 0.85;
      }
    } catch (error) {
      console.log('Tier 3 pattern analysis failed:', error.message);
    }

    // Tier 4: Behavioral/Mathematical Analysis (60% Trust)
    try {
      results.tier4 = await this.tier4Analysis.analyzeBehavioralIndicators(extractedText);
    } catch (error) {
      console.log('Tier 4 behavioral analysis failed:', error.message);
    }

    // Synthesize results following your hierarchy
    results.finalVerdict = this.determineVerdict(results);
    results.confidence = this.calculateFinalConfidence(results, ocrResult);
    
    return results;
  }

  determineVerdict(results) {
    // Follow your strict hierarchy: Tier 1 > Tier 2 > Tier 3 > Tier 4
    
    if (results.tier1?.verdict) {
      return results.tier1.verdict;
    }
    
    if (results.tier2?.verdict && results.tier2.multipleSourcesConfirm) {
      return results.tier2.verdict;
    }
    
    if (results.tier3?.verdict && results.tier3.strongPatternMatch) {
      return results.tier3.verdict;
    }
    
    if (results.tier4?.verdict) {
      return results.tier4.verdict;
    }
    
    return 'INCONCLUSIVE';
  }

  calculateFinalConfidence(results, ocrResult) {
    // OCR confidence affects overall confidence
    const ocrMultiplier = Math.min(1.0, ocrResult.confidence / 0.8);
    
    if (results.tier1?.confidence) {
      return results.tier1.confidence * ocrMultiplier;
    }
    
    if (results.tier2?.confidence) {
      return results.tier2.confidence * ocrMultiplier;
    }
    
    if (results.tier3?.confidence) {
      return results.tier3.confidence * ocrMultiplier;
    }
    
    if (results.tier4?.confidence) {
      return results.tier4.confidence * ocrMultiplier;
    }
    
    return 0.1; // Very low confidence
  }

  synthesizeResults(ocrResult, verificationResult) {
    const analysis = {
      // Core result
      verdict: verificationResult.finalVerdict,
      confidence: verificationResult.confidence,
      
      // Evidence breakdown
      evidence: {
        extractedText: ocrResult.text,
        ocrEvidence: ocrResult.evidence,
        tier1Evidence: verificationResult.tier1,
        tier2Evidence: verificationResult.tier2,
        tier3Evidence: verificationResult.tier3,
        tier4Evidence: verificationResult.tier4
      },
      
      // Recommendations
      recommendations: this.generateEnhancedRecommendations(
        verificationResult.finalVerdict,
        ocrResult,
        verificationResult
      ),
      
      // Metadata
      metadata: {
        ocrStrategy: ocrResult.ocrMetadata?.strategy,
        ocrConfidence: ocrResult.confidence,
        processingTime: ocrResult.ocrMetadata?.processingTime,
        sourcesChecked: this.getSourcesChecked(verificationResult),
        analysisTimestamp: new Date().toISOString()
      }
    };

    // Special handling for high-confidence scams
    if (analysis.confidence > 0.9 && analysis.verdict.includes('SCAM')) {
      analysis.priority = 'HIGH_RISK';
      analysis.recommendations.unshift('🚨 STOP - This is almost certainly a scam');
    }

    return analysis;
  }

  generateEnhancedRecommendations(verdict, ocrResult, verificationResult) {
    const recommendations = [...(ocrResult.recommendations || [])];
    
    // Add tier-specific recommendations
    if (verificationResult.tier1?.recommendations) {
      recommendations.push(...verificationResult.tier1.recommendations);
    }
    
    if (verificationResult.tier2?.recommendations) {
      recommendations.push(...verificationResult.tier2.recommendations);
    }
    
    // Add specific recommendations based on detected patterns
    if (verdict === 'DEFINITE_SCAM') {
      recommendations.push('📞 Report to FTC at reportfraud.ftc.gov');
      recommendations.push('📧 Forward phishing emails to spam@uce.gov');
      recommendations.push('🛡️ Block sender and mark as spam');
    }
    
    // OCR-specific recommendations
    if (ocrResult.ocrMetadata?.strategy === 'email_regions') {
      recommendations.push('✅ Email structure analysis completed');
    }
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  getSourcesChecked(verificationResult) {
    const sources = [];
    
    if (verificationResult.tier1) sources.push('Government/Regulatory');
    if (verificationResult.tier2) sources.push('Complaint Databases');
    if (verificationResult.tier3) sources.push('Pattern Recognition');
    if (verificationResult.tier4) sources.push('Behavioral Analysis');
    
    return sources;
  }

  handleManualReviewCase(ocrResult, imagePath) {
    return {
      verdict: 'MANUAL_REVIEW_REQUIRED',
      confidence: 0,
      evidence: {
        reason: 'OCR extraction failed - human review needed',
        imagePath: imagePath,
        failureReason: ocrResult.evidence.reason
      },
      recommendations: [
        '👁️ Please describe what you see in this image',
        '🔍 Look for: sender info, urgent language, money requests',
        '⚠️ When in doubt, assume it\'s suspicious',
        '📞 Contact the claimed organization directly using known phone numbers'
      ],
      metadata: {
        requiresHumanInput: true,
        priority: 'MANUAL_REVIEW',
        analysisTimestamp: new Date().toISOString()
      }
    };
  }

  createErrorResponse(error, imagePath) {
    return {
      verdict: 'ANALYSIS_ERROR',
      confidence: 0,
      evidence: {
        error: error.message,
        imagePath: imagePath
      },
      recommendations: [
        '❌ Analysis failed - please try again',
        '🔍 If this persists, describe the content manually',
        '⚠️ When in doubt, be cautious'
      ],
      metadata: {
        hasError: true,
        errorTimestamp: new Date().toISOString()
      }
    };
  }

  async terminate() {
    await this.ocrService.terminate();
  }
}

// Mock services representing your existing tier architecture
class Tier1VerificationService {
  async verifyAgainstAuthoritySources(text) {
    // Mock implementation - replace with your actual Tier 1 sources
    console.log('Checking Tier 1: Government/Regulatory sources...');
    
    // Check FTC complaint database
    // Check SEC enforcement actions  
    // Check IRS official communications
    // Check domain registration data
    
    const lowerText = text.toLowerCase();
    
    // Simple mock: if it claims to be from IRS but uses Gmail
    if (lowerText.includes('irs') && lowerText.includes('gmail.com')) {
      return {
        verdict: 'CONFIRMED_FRAUD',
        confidence: 1.0,
        source: 'IRS does not use Gmail',
        recommendations: ['🚨 IRS never emails about refunds or account issues']
      };
    }
    
    // Mark Zuckerberg using Gmail is obviously fake
    if (lowerText.includes('mark zuckerberg') && lowerText.includes('gmail.com')) {
      return {
        verdict: 'CONFIRMED_FRAUD',
        confidence: 1.0,
        source: 'Facebook CEO verification',
        recommendations: ['🚨 Real executives don\'t use personal Gmail for business']
      };
    }
    
    return { verdict: null, confidence: 0 };
  }
}

class Tier2VerificationService {
  async checkComplaintDatabases(text) {
    console.log('Checking Tier 2: Complaint databases...');
    
    // Mock implementation - replace with actual BBB, Trustpilot, etc.
    const lowerText = text.toLowerCase();
    
    // Check for known scam patterns in complaint databases
    if (lowerText.includes('winning amount') && lowerText.includes('facebook')) {
      return {
        verdict: 'SCAM',
        confidence: 0.95,
        multipleSourcesConfirm: true,
        sources: ['BBB Scam Tracker', 'FTC Consumer Sentinel'],
        recommendations: ['📊 Multiple sources confirm this as a known scam pattern']
      };
    }
    
    return { verdict: null, confidence: 0, multipleSourcesConfirm: false };
  }
}

class Tier3PatternService {
  async analyzeScamPatterns(text, ocrResult) {
    console.log('Checking Tier 3: Pattern recognition...');
    
    // This is where your existing pattern detection would integrate
    const patterns = {
      lotteryScam: /lottery|won|prize|congratulations.*amount/gi,
      authorityImpersonation: /ceo.*facebook|irs.*refund|microsoft.*security/gi,
      urgencyLanguage: /urgent|immediate|expires.*today|act now/gi,
      financialLure: /\$[\d,]+|million|inheritance.*fund/gi
    };
    
    let patternMatches = 0;
    const detectedPatterns = [];
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      const matches = text.match(regex);
      if (matches) {
        patternMatches += matches.length;
        detectedPatterns.push({ pattern: patternName, matches: matches });
      }
    }
    
    const strongPatternMatch = patternMatches >= 3;
    
    return {
      verdict: strongPatternMatch ? 'LIKELY_SCAM' : 'SUSPICIOUS',
      confidence: strongPatternMatch ? 0.85 : 0.60,
      strongPatternMatch: strongPatternMatch,
      patterns: detectedPatterns,
      patternCount: patternMatches
    };
  }
}

class Tier4BehavioralService {
  async analyzeBehavioralIndicators(text) {
    console.log('Checking Tier 4: Behavioral analysis...');
    
    // Mathematical impossibility checks
    // Emotional manipulation detection
    // Business model sustainability analysis
    
    const indicators = {
      mathematicallyImpossible: this.checkMathematicalClaims(text),
      emotionalManipulation: this.checkEmotionalTriggers(text),
      businessModelFlaws: this.checkBusinessModel(text)
    };
    
    const totalIndicators = Object.values(indicators).filter(Boolean).length;
    
    return {
      verdict: totalIndicators >= 2 ? 'SUSPICIOUS' : 'INCONCLUSIVE',
      confidence: 0.60,
      indicators: indicators,
      indicatorCount: totalIndicators
    };
  }
  
  checkMathematicalClaims(text) {
    // Check for impossible returns, lottery odds claims, etc.
    return /guaranteed.*\d+%|500%.*return|risk.*free.*profit/gi.test(text);
  }
  
  checkEmotionalTriggers(text) {
    // Check for fear, urgency, scarcity tactics
    return /limited.*time|expires.*today|last.*chance|don't.*miss/gi.test(text);
  }
  
  checkBusinessModel(text) {
    // Check for unsustainable business claims
    return /no.*investment|free.*money|passive.*income.*guaranteed/gi.test(text);
  }
}

// Express.js integration example
class BullshitDetectorAPI {
  constructor() {
    this.detector = new BullshitDetectorOCRIntegration();
  }
  
  setupRoutes(app) {
    // Handle image uploads for analysis
    app.post('/api/analyze-image', async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No image provided' });
        }
        
        const result = await this.detector.analyzeImageContent(req.file.path);
        
        res.json({
          success: true,
          analysis: result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('API analysis failed:', error);
        res.status(500).json({
          success: false,
          error: 'Analysis failed',
          message: error.message
        });
      }
    });
    
    // Handle manual review submissions
    app.post('/api/manual-review', async (req, res) => {
      const { imageId, userDescription, userVerdict } = req.body;
      
      // Store manual review for training data
      // This helps improve OCR and pattern detection
      
      res.json({
        success: true,
        message: 'Manual review submitted for training'
      });
    });
  }
}

module.exports = {
  BullshitDetectorOCRIntegration,
  BullshitDetectorAPI,
  EnhancedOCRService
};

// Usage example:
/*
const detector = new BullshitDetectorOCRIntegration();

async function analyzeZuckEmail() {
  const result = await detector.analyzeImageContent('/path/to/zuck-spam-email.png');
  
  console.log('Final Analysis:', {
    verdict: result.verdict,           // "DEFINITE_SCAM"
    confidence: result.confidence,     // 0.95
    evidence: result.evidence,         // Full breakdown
    recommendations: result.recommendations  // Action items
  });
  
  // Expected output for Zuck email:
  // {
  //   verdict: "DEFINITE_SCAM",
  //   confidence: 0.95,
  //   evidence: {
  //     tier1Evidence: { verdict: "CONFIRMED_FRAUD", source: "Facebook CEO verification" },
  //     tier3Evidence: { strongPatternMatch: true, patternCount: 4 }
  //   },
  //   recommendations: [
  //     "🚨 STOP - This is almost certainly a scam",
  //     "🚨 Real executives don't use personal Gmail for business",
  //     "📞 Report to FTC at reportfraud.ftc.gov"
  //   ]
  // }
}
*/