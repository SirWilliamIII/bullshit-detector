/**
 * Follow-up Question Generator
 * Generates intelligent follow-up questions based on verification results
 * to help strengthen confidence when analysis is uncertain
 */

class FollowUpQuestionGenerator {
  constructor() {
    this.uncertaintyThresholds = {
      low: 0.4,      // Below 40% confidence
      medium: 0.7,   // 40-70% confidence  
      high: 0.85     // Above 85% confidence
    };
  }

  /**
   * Generate follow-up questions based on verification results
   */
  generateFollowUpQuestions(verificationResult) {
    const confidence = verificationResult.confidence || 0;
    const verdict = verificationResult.verdict;
    const context = verificationResult.context || {};
    const sources = verificationResult.sources || {};
    
    // Only generate questions for uncertain results
    if (confidence > this.uncertaintyThresholds.high) {
      return null; // High confidence, no questions needed
    }

    const questions = [];
    const uncertaintyLevel = this.getUncertaintyLevel(confidence);
    
    // Generate questions based on context and findings
    const contextQuestions = this.generateContextQuestions(context, sources);
    const patternQuestions = this.generatePatternQuestions(sources);
    const sourceQuestions = this.generateSourceQuestions(context);
    const behaviorQuestions = this.generateBehaviorQuestions(verificationResult);
    
    questions.push(...contextQuestions);
    questions.push(...patternQuestions);
    questions.push(...sourceQuestions);
    questions.push(...behaviorQuestions);
    
    // Prioritize and limit questions based on uncertainty level
    const prioritizedQuestions = this.prioritizeQuestions(questions, uncertaintyLevel);
    
    return {
      confidenceLevel: confidence,
      uncertaintyLevel,
      questions: prioritizedQuestions,
      explanation: this.getQuestionExplanation(uncertaintyLevel, verdict)
    };
  }

  /**
   * Generate context-specific questions
   */
  generateContextQuestions(context, sources) {
    const questions = [];
    
    // Email/Communication context
    if (context.claimTypes?.includes('communication') || context.entities?.some(e => e.type === 'email')) {
      questions.push({
        id: 'email_expectation',
        type: 'yes_no',
        question: 'Were you expecting to receive this email or message?',
        weight: 'high',
        category: 'context',
        followUp: {
          yes: 'Can you verify the sender through another communication method?',
          no: 'This increases suspicion - unexpected messages are often scams'
        }
      });
      
      questions.push({
        id: 'sender_recognition',
        type: 'yes_no',
        question: 'Do you recognize the sender from previous legitimate communications?',
        weight: 'high',
        category: 'context'
      });
    }

    // Financial context
    if (context.claimTypes?.includes('financial')) {
      questions.push({
        id: 'financial_account',
        type: 'yes_no',
        question: 'Do you have an active account with the organization mentioned?',
        weight: 'high',
        category: 'financial',
        followUp: {
          yes: 'Check your account directly (not through this message) to verify any claims',
          no: 'This is likely a scam - you cannot win prizes from organizations you don\'t use'
        }
      });

      questions.push({
        id: 'payment_request',
        type: 'yes_no',
        question: 'Are you being asked to pay money upfront (fees, taxes, shipping)?',
        weight: 'critical',
        category: 'financial',
        followUp: {
          yes: 'This is a major red flag - legitimate prizes never require upfront payments',
          no: 'Good, but still verify independently'
        }
      });
    }

    // Web/URL context
    if (context.entities?.some(e => e.type === 'url')) {
      questions.push({
        id: 'url_familiar',
        type: 'yes_no',
        question: 'Are the website links using the official domain you\'d expect?',
        weight: 'high',
        category: 'technical',
        followUp: {
          yes: 'Double-check the exact spelling and look for suspicious subdomains',
          no: 'Suspicious domains are a major red flag for scams'
        }
      });
    }

    return questions;
  }

  /**
   * Generate pattern-based questions
   */
  generatePatternQuestions(sources) {
    const questions = [];
    
    // Look for urgency patterns
    const urgencyFound = sources.results?.some(r => 
      r.data?.patterns?.includes('urgency') || 
      r.data?.findings?.some(f => f.toLowerCase().includes('urgency'))
    );
    
    if (urgencyFound) {
      questions.push({
        id: 'urgency_pressure',
        type: 'multiple_choice',
        question: 'How urgent does this message make you feel you need to act?',
        weight: 'medium',
        category: 'psychology',
        options: [
          { value: 'immediate', label: 'I need to act immediately', risk: 'high' },
          { value: 'soon', label: 'I should respond soon', risk: 'medium' },
          { value: 'no_rush', label: 'No particular urgency', risk: 'low' }
        ]
      });
    }

    // Look for authority patterns
    const authorityFound = sources.results?.some(r => 
      r.data?.patterns?.includes('authority')
    );
    
    if (authorityFound) {
      questions.push({
        id: 'authority_verification',
        type: 'yes_no',
        question: 'Have you verified this message through the organization\'s official channels?',
        weight: 'high',
        category: 'verification',
        followUp: {
          yes: 'Good practice! What did the official source say?',
          no: 'Please verify through official channels before taking any action'
        }
      });
    }

    return questions;
  }

  /**
   * Generate source-specific questions
   */
  generateSourceQuestions(context) {
    const questions = [];
    
    // Image analysis questions
    if (context.sourceType === 'image') {
      questions.push({
        id: 'image_quality',
        type: 'multiple_choice',
        question: 'How would you describe the image quality and professionalism?',
        weight: 'medium',
        category: 'visual',
        options: [
          { value: 'professional', label: 'Professional, high-quality', risk: 'low' },
          { value: 'average', label: 'Average quality', risk: 'medium' },
          { value: 'poor', label: 'Poor quality, pixelated, or amateur', risk: 'high' }
        ]
      });

      questions.push({
        id: 'image_authenticity',
        type: 'yes_no',
        question: 'Does anything in the image look edited, fake, or inconsistent?',
        weight: 'high',
        category: 'visual',
        followUp: {
          yes: 'This is a major red flag - describe what looks suspicious',
          no: 'Good, but visual manipulation can be sophisticated'
        }
      });
    }

    return questions;
  }

  /**
   * Generate behavioral questions
   */
  generateBehaviorQuestions(verificationResult) {
    const questions = [];
    
    questions.push({
      id: 'too_good_to_be_true',
      type: 'yes_no',
      question: 'Does this offer or claim seem too good to be true?',
      weight: 'high',
      category: 'intuition',
      followUp: {
        yes: 'Trust your instincts - if it seems too good to be true, it probably is',
        no: 'Even legitimate-seeming offers should be verified'
      }
    });

    questions.push({
      id: 'personal_info_request',
      type: 'yes_no',
      question: 'Are you being asked to provide personal information (SSN, passwords, etc.)?',
      weight: 'critical',
      category: 'security',
      followUp: {
        yes: 'STOP - Never provide personal information through unsolicited messages',
        no: 'Good, but be cautious of any future requests'
      }
    });

    return questions;
  }

  /**
   * Prioritize questions based on uncertainty level and importance
   */
  prioritizeQuestions(questions, uncertaintyLevel) {
    // Sort by weight (critical > high > medium > low)
    const weightOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    questions.sort((a, b) => weightOrder[b.weight] - weightOrder[a.weight]);
    
    // Limit number of questions based on uncertainty
    let maxQuestions;
    switch (uncertaintyLevel) {
      case 'high':
        maxQuestions = 5;
        break;
      case 'medium':
        maxQuestions = 3;
        break;
      case 'low':
        maxQuestions = 2;
        break;
      default:
        maxQuestions = 3;
    }
    
    return questions.slice(0, maxQuestions);
  }

  /**
   * Get uncertainty level description
   */
  getUncertaintyLevel(confidence) {
    if (confidence < this.uncertaintyThresholds.low) {
      return 'high';
    } else if (confidence < this.uncertaintyThresholds.medium) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get explanation for why questions are being asked
   */
  getQuestionExplanation(uncertaintyLevel, verdict) {
    switch (uncertaintyLevel) {
      case 'high':
        return 'Our analysis shows mixed signals. A few additional questions will help provide a more definitive assessment.';
      case 'medium':
        return 'While we have some indicators, additional context would strengthen our confidence in the analysis.';
      case 'low':
        return 'Our analysis is fairly confident, but these questions could help confirm our assessment.';
      default:
        return 'Additional context would help improve the accuracy of our analysis.';
    }
  }

  /**
   * Process user answers and update confidence
   */
  processAnswers(originalResult, answers) {
    let confidenceAdjustment = 0;
    const insights = [];
    
    for (const [questionId, answer] of Object.entries(answers)) {
      const adjustment = this.calculateConfidenceAdjustment(questionId, answer);
      confidenceAdjustment += adjustment.value;
      
      if (adjustment.insight) {
        insights.push(adjustment.insight);
      }
    }
    
    // Update confidence with bounds checking
    const newConfidence = Math.max(0, Math.min(1, originalResult.confidence + confidenceAdjustment));
    
    return {
      ...originalResult,
      confidence: newConfidence,
      confidenceAdjustment,
      followUpInsights: insights,
      enhancedByQuestions: true
    };
  }

  /**
   * Calculate confidence adjustment based on specific answers
   */
  calculateConfidenceAdjustment(questionId, answer) {
    const adjustments = {
      email_expectation: {
        yes: { value: 0.1, insight: 'Expected communication reduces suspicion' },
        no: { value: -0.15, insight: 'Unexpected messages increase suspicion significantly' }
      },
      financial_account: {
        yes: { value: 0.05, insight: 'Having an account makes legitimate communication possible' },
        no: { value: -0.2, insight: 'No account relationship is a major red flag' }
      },
      payment_request: {
        yes: { value: -0.25, insight: 'Upfront payment requests are classic scam indicators' },
        no: { value: 0.1, insight: 'No upfront payment reduces scam likelihood' }
      },
      urgency_pressure: {
        immediate: { value: -0.15, insight: 'High urgency pressure is a manipulation tactic' },
        soon: { value: -0.05, insight: 'Moderate urgency is suspicious' },
        no_rush: { value: 0.1, insight: 'No urgency pressure is positive' }
      },
      too_good_to_be_true: {
        yes: { value: -0.2, insight: 'User\'s instinct that offer is too good to be true' },
        no: { value: 0.05, insight: 'Offer seems reasonable to user' }
      },
      personal_info_request: {
        yes: { value: -0.3, insight: 'Personal information requests are critical red flags' },
        no: { value: 0.1, insight: 'No personal info request is positive' }
      }
    };
    
    return adjustments[questionId]?.[answer] || { value: 0, insight: null };
  }
}

module.exports = FollowUpQuestionGenerator;