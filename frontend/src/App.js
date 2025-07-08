import React, { useState, useRef } from 'react';
import { Upload, MessageCircle, AlertTriangle, CheckCircle, Info, Camera } from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const BullshitDetector = () => {
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('text');
  const [showInvestigator, setShowInvestigator] = useState(false);
  const [investigatorQuestions, setInvestigatorQuestions] = useState([]);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [investigatorAnswers, setInvestigatorAnswers] = useState({});
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const fileInputRef = useRef(null);

  // FIXED: Helper function to normalize API responses
  const normalizeAnalysisResponse = (response) => {
    // Handle both old and new API response formats
    const normalized = {
      suspicionLevel: response.suspicionLevel || response.verdict || 'UNKNOWN',
      findings: response.findings || response.recommendations || [],
      questions: response.questions || [
        'Can you provide more details about this?',
        'Where did you encounter this?',
        'What made you suspicious about this?'
      ],
      calculations: response.calculations || {},
      extractedText: response.extractedText || response.evidence?.extractedText || null,
      confidence: response.confidence || 0,
      verdict: response.verdict || response.suspicionLevel || 'UNKNOWN'
    };

    // Convert verdict to suspicion level format
    if (normalized.verdict === 'DEFINITE_SCAM') {
      normalized.suspicionLevel = 'HIGH';
    } else if (normalized.verdict === 'LIKELY_SCAM') {
      normalized.suspicionLevel = 'MEDIUM';
    } else if (normalized.verdict === 'SUSPICIOUS') {
      normalized.suspicionLevel = 'MEDIUM';
    } else if (normalized.verdict === 'MANUAL_REVIEW_REQUIRED') {
      normalized.suspicionLevel = 'MEDIUM';
    }

    // Ensure findings is always an array
    if (!Array.isArray(normalized.findings)) {
      normalized.findings = normalized.findings ? [normalized.findings] : ['Analysis completed'];
    }

    // Ensure questions is always an array
    if (!Array.isArray(normalized.questions)) {
      normalized.questions = normalized.questions ? [normalized.questions] : [
        'Can you provide more details?',
        'What made this seem suspicious?'
      ];
    }

    return normalized;
  };

  // API call helper
  const callAPI = async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call to ${endpoint} failed:`, error);
      throw error;
    }
  };

  // Backend analysis using the Node.js API
  const analyzeInput = async (userInput, inputType = 'text') => {
    setIsAnalyzing(true);
    
    try {
      const response = await callAPI('/api/analyze-text', {
        method: 'POST',
        body: JSON.stringify({ text: userInput }),
      });
      
      setIsAnalyzing(false);
      return normalizeAnalysisResponse(response.analysis);
      
    } catch (error) {
      console.error('Analysis error:', error);
      setIsAnalyzing(false);
      
      // Fallback response if backend fails
      return normalizeAnalysisResponse({
        suspicionLevel: 'LOW',
        findings: [`Analysis service temporarily unavailable: ${error.message}`],
        questions: ['Can you provide more specific details to analyze?'],
        calculations: {}
      });
    }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const userMessage = { type: 'user', content: input, timestamp: new Date() };
    setConversation(prev => [...prev, userMessage]);

    const analysis = await analyzeInput(input);
    
    const systemMessage = {
      type: 'system',
      content: analysis,
      timestamp: new Date()
    };
    
    setConversation(prev => [...prev, systemMessage]);
    setCurrentAnalysis(analysis);
    setInvestigatorQuestions(analysis.questions);
    setInput('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Create image preview
    const imageUrl = URL.createObjectURL(file);
    
    const userMessage = { 
      type: 'user', 
      content: `[Uploaded image: ${file.name}]`,
      file: file,
      imageUrl: imageUrl,
      timestamp: new Date() 
    };
    
    setConversation(prev => [...prev, userMessage]);

    // Send image to backend for OCR + analysis
    setIsAnalyzing(true);
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch(`${API_BASE_URL}/api/analyze-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Image analysis result:', result); // Debug log
      
      // FIXED: Normalize the response before using it
      const normalizedAnalysis = normalizeAnalysisResponse(result.analysis);
      
      const systemMessage = {
        type: 'system',
        content: {
          ...normalizedAnalysis,
          ocrExtracted: true,
          method: result.method || 'unknown'
        },
        timestamp: new Date()
      };
      
      setConversation(prev => [...prev, systemMessage]);
      setCurrentAnalysis(normalizedAnalysis);
      setInvestigatorQuestions(normalizedAnalysis.questions);
      setIsAnalyzing(false);
      
    } catch (error) {
      console.error('Image analysis error:', error);
      setIsAnalyzing(false);
      
      // Fallback response for image analysis failure
      const fallbackMessage = {
        type: 'system',
        content: normalizeAnalysisResponse({
          suspicionLevel: 'MEDIUM',
          findings: [`Image analysis failed: ${error.message}`],
          questions: [
            'Can you tell me what text you see in this image?',
            'Are there any suspicious links or claims?',
            'What company or service is this supposedly from?'
          ],
          calculations: {},
          extractedText: 'OCR extraction failed - manual review needed',
          ocrExtracted: false
        }),
        timestamp: new Date()
      };
      
      setConversation(prev => [...prev, fallbackMessage]);
      setCurrentAnalysis(fallbackMessage.content);
      setInvestigatorQuestions(fallbackMessage.content.questions);
    }
  };

  const handleInvestigatorQuestion = async (question, userAnswer = null) => {
    // If user provided an answer, analyze it
    if (userAnswer && userAnswer.trim()) {
      const questionMessage = { 
        type: 'investigator', 
        content: `Question: ${question}`,
        answer: userAnswer,
        timestamp: new Date() 
      };
      setConversation(prev => [...prev, questionMessage]);
      
      // Use backend to analyze the user's answer
      setIsAnalyzing(true);
      
      try {
        const response = await callAPI('/api/investigate', {
          method: 'POST',
          body: JSON.stringify({ 
            question, 
            answer: userAnswer,
            context: currentAnalysis ? JSON.stringify(currentAnalysis) : ''
          }),
        });
        
        const followUp = {
          type: 'system',
          content: normalizeAnalysisResponse(response.analysis),
          timestamp: new Date()
        };
        
        setConversation(prev => [...prev, followUp]);
        setIsAnalyzing(false);
        setSelectedQuestion(null);
        setInvestigatorAnswers({});
        
      } catch (error) {
        console.error('Follow-up analysis error:', error);
        setIsAnalyzing(false);
        
        // Fallback response
        const fallbackResponse = {
          type: 'system',
          content: normalizeAnalysisResponse({
            suspicionLevel: 'MEDIUM',
            findings: [`Investigation failed: ${error.message}`],
            questions: ['Can you provide any additional details?'],
            calculations: {}
          }),
          timestamp: new Date()
        };
        
        setConversation(prev => [...prev, fallbackResponse]);
        setSelectedQuestion(null);
        setInvestigatorAnswers({});
      }
    } else {
      // Just select the question for answering
      setSelectedQuestion(question);
    }
  };

  const getSuspicionColor = (level) => {
    switch(level?.toUpperCase()) {
      case 'HIGH': return 'text-red-600 bg-red-50 border-red-200';
      case 'MEDIUM': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'LOW': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSuspicionIcon = (level) => {
    switch(level?.toUpperCase()) {
      case 'HIGH': return <AlertTriangle className="w-5 h-5" />;
      case 'MEDIUM': return <Info className="w-5 h-5" />;
      case 'LOW': return <CheckCircle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Truth Engine</h1>
          <p className="text-gray-600 mt-2">Expose the reality behind deals, claims, and offers</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="p-6">
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setActiveTab('text')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'text' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <MessageCircle className="w-4 h-4 inline mr-2" />
                Text Analysis
              </button>
              <button
                onClick={() => setActiveTab('image')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'image' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Camera className="w-4 h-4 inline mr-2" />
                Image/Screenshot
              </button>
            </div>

            {activeTab === 'text' ? (
              <div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Paste an email, text message, or describe what you want to analyze..."
                  className="w-full h-32 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="mt-4 flex justify-between items-center">
                  <p className="text-sm text-gray-500">
                    Share anything suspicious - we'll help you investigate it together.
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={!input.trim() || isAnalyzing}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-700 mb-2">Upload Screenshot or Image</p>
                  <p className="text-gray-500">Screenshots of emails, contracts, ads, or any document</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className="space-y-6">
          {conversation.map((message, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border">
              {message.type === 'user' ? (
                <div className="p-6">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">You</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-800">{message.content}</p>
                      {message.imageUrl && (
                        <div className="mt-3">
                          <img 
                            src={message.imageUrl} 
                            alt="Uploaded screenshot" 
                            className="max-w-sm rounded-lg border shadow-sm"
                          />
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ) : message.type === 'system' ? (
                <div className="p-6">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-medium text-sm">TE</span>
                    </div>
                    <div className="flex-1">
                      {/* Suspicion Level */}
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border mb-4 ${getSuspicionColor(message.content.suspicionLevel)}`}>
                        {getSuspicionIcon(message.content.suspicionLevel)}
                        <span className="ml-2">
                          {(message.content.suspicionLevel || 'UNKNOWN').toUpperCase()} SUSPICION
                        </span>
                        {message.content.ocrExtracted && (
                          <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                            📷 OCR ANALYZED
                          </span>
                        )}
                        {message.content.method && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                            {message.content.method.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Confidence Score */}
                      {message.content.confidence && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Confidence:</span>
                            <span className="font-medium">{Math.round(message.content.confidence * 100)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{width: `${message.content.confidence * 100}%`}}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* OCR Extracted Text */}
                      {message.content.extractedText && (
                        <div className="mb-6">
                          <h3 className="font-semibold text-gray-900 mb-3">Extracted Text:</h3>
                          <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-purple-400">
                            <p className="text-gray-800 italic">"{message.content.extractedText}"</p>
                          </div>
                        </div>
                      )}

                      {/* Findings */}
                      <div className="mb-6">
                        <h3 className="font-semibold text-gray-900 mb-3">Key Findings:</h3>
                        <ul className="space-y-2">
                          {(message.content.findings || []).map((finding, idx) => (
                            <li key={idx} className="flex items-start">
                              <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-gray-700">{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Calculations */}
                      {message.content.calculations && Object.keys(message.content.calculations).length > 0 && (
                        <div className="mb-6">
                          <h3 className="font-semibold text-gray-900 mb-3">Analysis:</h3>
                          <div className="bg-gray-50 rounded-lg p-4">
                            {Object.entries(message.content.calculations).map(([key, value], idx) => (
                              <div key={idx} className="flex justify-between py-2 border-b border-gray-200 last:border-b-0">
                                <span className="font-medium text-gray-700">{key}:</span>
                                <span className="text-gray-900">{typeof value === 'object' ? JSON.stringify(value) : value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Questions - Now Clickable */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900">Let's investigate further:</h3>
                          <button
                            onClick={() => setShowInvestigator(true)}
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            🔍 Start Investigation
                          </button>
                        </div>
                        <ul className="space-y-2">
                          {(message.content.questions || []).map((question, idx) => (
                            <li key={idx} className="flex items-start">
                              <span className="text-blue-600 font-medium mr-2">{idx + 1}.</span>
                              <button
                                onClick={() => handleInvestigatorQuestion(question)}
                                className="text-left text-gray-700 hover:text-blue-600 hover:underline transition-colors"
                              >
                                {question}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <p className="text-xs text-gray-500">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-blue-50 border-l-4 border-blue-400">
                  <div className="flex items-start">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-white text-sm">🔍</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-blue-900">{message.content}</p>
                      {message.answer && (
                        <div className="mt-2 p-2 bg-white rounded border">
                          <p className="text-sm text-gray-600">Your answer:</p>
                          <p className="text-gray-800">{message.answer}</p>
                        </div>
                      )}
                      <p className="text-xs text-blue-600 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Investigation Popup */}
        {showInvestigator && investigatorQuestions.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-96 overflow-hidden">
              <div className="p-4 border-b bg-blue-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-3">
                      <span className="text-white text-sm">🔍</span>
                    </div>
                    <h3 className="font-semibold text-gray-900">Investigation Assistant</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowInvestigator(false);
                      setSelectedQuestion(null);
                      setInvestigatorAnswers({});
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
              </div>
              
              <div className="p-4 max-h-80 overflow-y-auto">
                {!selectedQuestion ? (
                  <>
                    <p className="text-gray-600 mb-4">
                      Let's dig deeper into this together. Click any question to investigate:
                    </p>
                    
                    <div className="space-y-3">
                      {investigatorQuestions.map((question, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedQuestion(question)}
                          className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                        >
                          <div className="flex items-start">
                            <span className="text-blue-600 font-medium mr-2 group-hover:text-blue-700">
                              {idx + 1}.
                            </span>
                            <span className="text-gray-700 group-hover:text-blue-700">
                              {question}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-4">
                      <strong>Question:</strong> {selectedQuestion}
                    </p>
                    
                    <textarea
                      value={investigatorAnswers[selectedQuestion] || ''}
                      onChange={(e) => setInvestigatorAnswers(prev => ({
                        ...prev,
                        [selectedQuestion]: e.target.value
                      }))}
                      placeholder="Share what you found or know about this..."
                      className="w-full h-24 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                    />
                    
                    <div className="flex space-x-3">
                      <button
                        onClick={() => handleInvestigatorQuestion(selectedQuestion, investigatorAnswers[selectedQuestion])}
                        disabled={!investigatorAnswers[selectedQuestion]?.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Analyze Answer
                      </button>
                      <button
                        onClick={() => {
                          setSelectedQuestion(null);
                          setInvestigatorAnswers(prev => {
                            const newAnswers = {...prev};
                            delete newAnswers[selectedQuestion];
                            return newAnswers;
                          });
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Back to Questions
                      </button>
                    </div>
                  </div>
                )}
                
                {!selectedQuestion && (
                  <div className="mt-4 pt-4 border-t">
                    <button
                      onClick={() => setShowInvestigator(false)}
                      className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      I'll investigate on my own
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">
              {activeTab === 'image' 
                ? 'Processing image, extracting text, analyzing patterns...' 
                : 'Analyzing patterns, checking sources, running calculations...'
              }
            </p>
          </div>
        )}

        {/* Sample Prompts */}
        {conversation.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Test with real analysis:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setInput("I got an email from goldrewards@gmail.com saying I won free gold but need to pay $100 shipping to goldrewards-claim.com")}
                className="text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-gray-800">Test: Email Scam</p>
                <p className="text-sm text-gray-600 mt-1">Real analysis of advance fee scam</p>
              </button>
              <button
                onClick={() => setInput("AT&T is offering me iPhone 16 Pro for $0 down with $800 off over 36 months if I trade in my old phone and get unlimited plan")}
                className="text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-gray-800">Test: Carrier Deal</p>
                <p className="text-sm text-gray-600 mt-1">Real analysis of phone contract terms</p>
              </button>
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Now using live analysis!</strong> Claude will research claims, verify domains, and provide real data-driven insights.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BullshitDetector;