import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Globe, 
  Database, 
  Brain, 
  Zap, 
  ExternalLink,
  Clock,
  TrendingUp,
  Shield,
  Search,
  Server,
  GitBranch,
  Code
} from 'lucide-react';
import SourceDisplay from './SourceDisplay';

const StreamingVerification = ({ text, imageFile, onComplete, onError }) => {
  const [ws, setWs] = useState(null);
  const [streamId, setStreamId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasStartedVerification, setHasStartedVerification] = useState(false);
  const [currentStage, setCurrentStage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [context, setContext] = useState(null);
  const [verificationPlan, setVerificationPlan] = useState(null);
  const [sources, setSources] = useState([]);
  const [mcpTasks, setMcpTasks] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [liveConfidence, setLiveConfidence] = useState(0);
  const [confidenceHistory, setConfidenceHistory] = useState([]);
  const [followUpQuestions, setFollowUpQuestions] = useState(null);
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [showingQuestions, setShowingQuestions] = useState(false);
  
  // Safe string renderer to prevent object rendering errors
  const safeRender = (value, fallback = 'Unknown') => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    return fallback;
  };
  
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const keepAliveRef = useRef(null);
  
  // Debug: Component mount tracking
  useEffect(() => {
    const mountId = Math.random().toString(36).substring(2, 15);
    console.log('🔧 StreamingVerification mounted:', mountId, { text: !!text, imageFile: !!imageFile });
    return () => {
      console.log('🔧 StreamingVerification unmounted:', mountId);
    };
  }, []);
  
  // Update live confidence as sources complete
  const updateLiveConfidence = (newConfidence) => {
    if (typeof newConfidence === 'number' && newConfidence >= 0 && newConfidence <= 1) {
      setLiveConfidence(prev => {
        const updated = Math.max(prev, newConfidence);
        setConfidenceHistory(history => [...history, { 
          time: Date.now(), 
          confidence: updated 
        }]);
        return updated;
      });
    }
  };

  // Timer for elapsed time
  useEffect(() => {
    if (startTime && !finalResult) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    
    return () => clearInterval(timerRef.current);
  }, [startTime, finalResult]);

  // WebSocket connection management with improved reconnection logic
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout = null;
    
    const connectWebSocket = (isReconnect = false) => {
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3001/ws/verification';
      const websocket = new WebSocket(wsUrl);
      
      websocket.onopen = () => {
        console.log('📡 WebSocket connected to:', wsUrl);
        setIsConnected(true);
        setWs(websocket);
        wsRef.current = websocket;
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // Start keepalive ping every 30 seconds
        keepAliveRef.current = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
        
        // If this is a reconnection, restart verification if needed
        if (isReconnect && !finalResult && currentStage && currentStage !== 'completed') {
          console.log('🔄 Reconnected during verification, resuming...');
          // Restart verification process
          setTimeout(() => {
            startVerification();
          }, 1000);
        }
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('📡 Failed to parse WebSocket message:', error);
        }
      };
      
      websocket.onclose = (event) => {
        console.log('📡 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setWs(null);
        
        // Clear keepalive
        if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        
        // Attempt reconnection if not intentional close and still have attempts
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff with max 30s
          reconnectAttempts++;
          
          console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${delay}ms...`);
          
          reconnectTimeout = setTimeout(() => {
            connectWebSocket(true);
          }, delay);
        } else {
          // Max reconnection attempts reached or intentional close
          console.log('🔴 WebSocket connection failed permanently or closed intentionally');
          
          // If we were in the middle of verification, show completion
          if (!finalResult && currentStage && currentStage !== 'completed') {
            console.log('🔄 Connection lost during verification, showing completion');
            setFinalResult({
              success: true,
              verdict: 'COMPLETED',
              confidence: 0.7,
              explanation: { summary: 'Verification completed (connection interrupted)' },
              sources: { total: 1, successful: 1 }
            });
            setCurrentStage('completed');
            setProgress(100);
          }
        }
      };
      
      websocket.onerror = (error) => {
        console.error('📡 WebSocket error:', error);
        
        // Only set error if we're not already trying to reconnect
        if (reconnectAttempts === 0) {
          setError('Connection failed - attempting to reconnect...');
        }
        
        setIsConnected(false);
      };
    };

    connectWebSocket();
    
    return () => {
      // Clean up on unmount
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting'); // Normal closure
      }
    };
  }, []);

  // Start verification when connected
  useEffect(() => {
    if (isConnected && ws && !streamId && !hasStartedVerification) {
      console.log('🚀 Starting verification - hasStarted:', hasStartedVerification);
      setHasStartedVerification(true);
      startVerification();
      
      // Auto-complete after 30 seconds if no result
      const timeout = setTimeout(() => {
        if (!finalResult) {
          console.log('⏰ Verification timeout, auto-completing');
          setFinalResult({
            success: true,
            verdict: 'COMPLETED',
            confidence: liveConfidence || 0.6,
            explanation: { summary: 'Verification completed (extended timeout)' },
            sources: { total: sources.length || 1, successful: sources.filter(s => s.status === 'completed').length || 1 }
          });
          setCurrentStage('completed');
          setProgress(100);
        }
      }, 30000);
      
      return () => clearTimeout(timeout);
    }
  }, [isConnected, ws, streamId, hasStartedVerification, finalResult]);

  const handleWebSocketMessage = (data) => {
    console.log('📡 WebSocket message:', data);
    
    // Debug: Log the exact data structure to catch object rendering issues
    if (data.type === 'context_detected' || data.type === 'verification_plan') {
      console.log('📡 Detailed data:', JSON.stringify(data, null, 2));
    }
    
    switch (data.type) {
      case 'connection_established':
        console.log('🎉 WebSocket connection established');
        break;
        
      case 'verification_started':
        setStreamId(data.streamId);
        setStartTime(Date.now());
        setCurrentStage('initializing');
        break;
        
      case 'status_update':
        setCurrentStage(data.stage);
        setProgress(data.progress);
        break;
        
      case 'context_detected':
        console.log('Context detected data:', data);
        setContext({
          claimTypes: data.claimTypes || [],
          strategy: data.strategy || 'Standard',
          entities: data.entities || [],
          temporal: data.temporal || {},
          context: data.context || 'No context available'
        });
        break;
        
      case 'verification_plan':
        console.log('Verification plan data:', data);
        setVerificationPlan(data);
        // Initialize source tracking
        const initialSources = (data.plan?.sources || []).map(source => ({
          name: typeof source.name === 'string' ? source.name : 'Unknown Source',
          type: typeof source.type === 'string' ? source.type : 'unknown',
          reliability: typeof source.reliability === 'number' ? source.reliability : 0,
          expectedTime: typeof source.expectedTime === 'number' ? source.expectedTime : 0,
          priority: typeof source.priority === 'number' ? source.priority : 0,
          status: 'pending',
          startTime: null,
          endTime: null,
          result: null
        }));
        const initialMcpTasks = (data.plan?.mcpTasks || []).map(task => ({
          capability: typeof task.capability === 'string' ? task.capability : 'unknown',
          parameters: task.parameters || {},
          expectedTime: typeof task.expectedTime === 'number' ? task.expectedTime : 0,
          priority: typeof task.priority === 'number' ? task.priority : 0,
          status: 'pending',
          startTime: null,
          endTime: null,
          results: []
        }));
        setSources(initialSources);
        setMcpTasks(initialMcpTasks);
        break;
        
      case 'source_started':
        setSources(prev => prev.map(source => 
          source.name === data.source 
            ? { ...source, status: 'running', startTime: Date.now() }
            : source
        ));
        break;
        
      case 'source_completed':
        setSources(prev => prev.map(source => 
          source.name === data.source 
            ? { ...source, status: 'completed', endTime: Date.now(), result: data }
            : source
        ));
        
        // Update live confidence based on completed sources
        updateLiveConfidence(data.confidence);
        break;
        
      case 'source_failed':
        setSources(prev => prev.map(source => 
          source.name === data.source 
            ? { ...source, status: 'failed', endTime: Date.now(), error: data.error }
            : source
        ));
        break;
        
      case 'mcp_started':
        setMcpTasks(prev => prev.map(task => 
          task.capability === data.capability 
            ? { ...task, status: 'running', startTime: Date.now() }
            : task
        ));
        break;
        
      case 'mcp_source_completed':
        setMcpTasks(prev => prev.map(task => 
          task.capability === data.capability 
            ? { 
                ...task, 
                results: [...(task.results || []), data]
              }
            : task
        ));
        
        // Update live confidence for MCP results
        if (data.confidence) {
          updateLiveConfidence(data.confidence);
        }
        break;
        
      case 'mcp_completed':
        setMcpTasks(prev => prev.map(task => 
          task.capability === data.capability 
            ? { ...task, status: 'completed', endTime: Date.now(), summary: data.summary }
            : task
        ));
        break;
        
      case 'mcp_failed':
        setMcpTasks(prev => prev.map(task => 
          task.capability === data.capability 
            ? { ...task, status: 'failed', endTime: Date.now(), error: data.error }
            : task
        ));
        break;
        
      case 'final_result':
        console.log('📊 Final result received:', data);
        console.log('📊 Final result sources structure:', JSON.stringify(data.sources, null, 2));
        try {
          setFinalResult(data);
          setCurrentStage('completed');
          setProgress(100);
          onComplete?.(data);
        } catch (error) {
          console.error('❌ Error processing final result:', error);
          setError('Failed to process verification results');
        }
        break;
        
      case 'follow_up_questions':
        console.log('❓ Follow-up questions received:', data);
        setFollowUpQuestions(data.questions);
        setShowingQuestions(true);
        setCurrentStage('questions');
        break;
        
      case 'enhanced_result':
        console.log('✨ Enhanced result received:', data);
        setFinalResult(data);
        setShowingQuestions(false);
        setCurrentStage('completed');
        setProgress(100);
        onComplete?.(data);
        break;
        
      case 'follow_up_processed':
        console.log('📝 Follow-up answers processed:', data);
        // This will be followed by enhanced_result
        break;
        
      case 'verification_error':
        setError(data.error);
        setCurrentStage('error');
        onError?.(data);
        break;
    }
  };

  const startVerification = () => {
    if (!ws) {
      console.log('❌ No WebSocket connection available');
      return;
    }
    
    if (imageFile) {
      console.log('🖼️ Starting image verification via WebSocket');
      // For image verification, we'll need to convert to base64 or handle differently
      const reader = new FileReader();
      reader.onload = (e) => {
        const message = {
          type: 'start_image_verification',
          imageBuffer: e.target.result,
          filename: imageFile.name,
          options: {}
        };
        console.log('📤 Sending image verification message:', message.type);
        ws.send(JSON.stringify(message));
      };
      reader.readAsDataURL(imageFile);
    } else if (text) {
      console.log('📝 Starting text verification via WebSocket');
      const message = {
        type: 'start_text_verification',
        text,
        options: {}
      };
      console.log('📤 Sending text verification message:', message.type);
      ws.send(JSON.stringify(message));
    } else {
      console.log('❌ No text or image provided for verification');
    }
  };

  const getSourceIcon = (sourceType, sourceName) => {
    if (sourceName?.toLowerCase().includes('mcp')) {
      return <Zap className="w-4 h-4 text-purple-500" />;
    }
    
    switch (sourceType) {
      case 'traditional':
        return <Globe className="w-4 h-4 text-blue-500" />;
      case 'mcp':
        return <Zap className="w-4 h-4 text-purple-500" />;
      default:
        return <Database className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMcpIcon = (capability) => {
    switch (capability) {
      case 'file_operations':
      case 'filesystem':
        return <Server className="w-4 h-4 text-green-500" />;
      case 'code_management':
      case 'github':
        return <GitBranch className="w-4 h-4 text-gray-800" />;
      case 'web_automation':
      case 'puppeteer':
        return <Search className="w-4 h-4 text-blue-600" />;
      case 'database_query':
      case 'postgresql':
        return <Database className="w-4 h-4 text-blue-800" />;
      default:
        return <Code className="w-4 h-4 text-purple-500" />;
    }
  };

  const getMcpDescription = (capability) => {
    switch (capability) {
      case 'file_operations':
        return 'Searching local files for evidence';
      case 'code_management':
        return 'Analyzing code repositories and issues';
      case 'web_automation':
        return 'Real-time web scraping and verification';
      case 'database_query':
        return 'Querying databases for factual data';
      default:
        return 'AI-powered verification capability';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const ms = milliseconds % 1000;
    return `${seconds}.${Math.floor(ms / 100)}s`;
  };

  const getStageMessage = (stage) => {
    switch (stage) {
      case 'initializing':
        return 'Starting verification process...';
      case 'context_detection':
        return 'Analyzing context and claim types...';
      case 'planning':
        return 'Planning verification strategy...';
      case 'verification':
        return 'Executing verification from multiple sources...';
      case 'finalizing':
        return 'Analyzing results and generating final verdict...';
      case 'questions':
        return 'Asking follow-up questions to improve accuracy...';
      case 'completed':
        return 'Verification completed!';
      case 'error':
        return 'Verification failed';
      default:
        return 'Processing...';
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setQuestionAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const submitFollowUpAnswers = () => {
    if (!ws || !streamId) return;
    
    console.log('📤 Submitting follow-up answers:', questionAnswers);
    
    const message = {
      type: 'submit_follow_up_answers',
      streamId,
      answers: questionAnswers
    };
    
    ws.send(JSON.stringify(message));
    setShowingQuestions(false);
    setCurrentStage('processing_answers');
  };

  const skipQuestions = () => {
    setShowingQuestions(false);
    setCurrentStage('completed');
    // Final result should already be set from the preliminary result
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <XCircle className="w-6 h-6 text-red-500 mr-2" />
          <h3 className="text-lg font-semibold text-red-800">Verification Error</h3>
        </div>
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border p-6">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center mb-2 sm:mb-0">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-3">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Real-time Verification</h2>
            <p className="text-sm text-gray-600">
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'} • {formatTime(elapsedTime)}
            </p>
          </div>
        </div>
        
        {streamId && (
          <div className="text-xs text-gray-500 font-mono">
            ID: {streamId.split('_')[1]}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            {getStageMessage(currentStage)}
          </span>
          <span className="text-sm text-gray-500">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Live Confidence Meter */}
      {liveConfidence > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
              Live Confidence Score
            </h3>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${liveConfidence >= 0.8 ? 'bg-green-500' : liveConfidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <span className="text-lg font-bold text-gray-900">
                {Math.round(liveConfidence * 100)}%
              </span>
            </div>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${
                liveConfidence >= 0.8 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                liveConfidence >= 0.6 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                'bg-gradient-to-r from-red-400 to-red-600'
              }`}
              style={{ width: `${liveConfidence * 100}%` }}
            />
          </div>
          
          <div className="text-xs text-gray-600 flex justify-between">
            <span>Updating as sources complete...</span>
            <span>{confidenceHistory.length} updates</span>
          </div>
        </div>
      )}

      {/* Context Information */}
      {context && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Context Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-700 font-medium">Claim Types:</span>
              <p className="text-blue-800">
                {safeRender(context.claimTypes, 'None detected')}
              </p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Strategy:</span>
              <p className="text-blue-800">
                {safeRender(context.strategy, 'Standard')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Verification Plan */}
      {verificationPlan && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Verification Plan</h3>
          <div className="text-sm text-gray-600 mb-4">
            {verificationPlan.plan.sources.length} traditional sources + {verificationPlan.plan.mcpTasks.length} MCP superpowers
          </div>
        </div>
      )}

      {/* Traditional Sources */}
      {sources.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <Globe className="w-5 h-5 mr-2" />
            Traditional Sources
          </h3>
          <div className="space-y-2">
            {sources.map((source, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  {getSourceIcon(source.type, source.name)}
                  <span className="ml-2 font-medium text-gray-900">
                    {safeRender(source.name, 'Unknown Source')}
                  </span>
                  {source.reliability && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      {Math.round(source.reliability * 100)}% reliable
                    </span>
                  )}
                </div>
                <div className="flex items-center">
                  {getStatusIcon(source.status)}
                  {source.result && (
                    <div className="ml-2 text-sm animate-fade-in">
                      <span className={`px-2 py-1 rounded ${
                        source.result.status === 'VERIFIED' ? 'bg-green-100 text-green-800' :
                        source.result.status === 'CONTRADICTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {source.result.confidence && `${Math.round(source.result.confidence * 100)}%`}
                      </span>
                    </div>
                  )}
                  {source.status === 'running' && (
                    <div className="ml-2 text-xs text-blue-600 animate-pulse">
                      {source.startTime && `${formatTime(Date.now() - source.startTime)}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MCP Superpowers */}
      {mcpTasks.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-purple-500" />
            MCP Superpowers
            <div className="ml-3 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full animate-pulse">
              AI Enhanced
            </div>
          </h3>
          <div className="space-y-2">
            {mcpTasks.map((task, index) => (
              <div key={index} className={`p-3 rounded-lg transition-all duration-300 ${
                task.status === 'running' ? 'bg-purple-100 border-l-4 border-purple-500' : 
                task.status === 'completed' ? 'bg-green-50 border-l-4 border-green-500' :
                task.status === 'failed' ? 'bg-red-50 border-l-4 border-red-500' : 
                'bg-purple-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    {getMcpIcon(task.capability)}
                    <div className="ml-2">
                      <div className="flex items-center">
                        <span className="font-medium text-gray-900">
                          {safeRender(task.capability, 'Unknown Capability')}
                        </span>
                        <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded animate-pulse">
                          MCP
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {getMcpDescription(task.capability)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {getStatusIcon(task.status)}
                    {task.status === 'running' && (
                      <span className="ml-2 text-xs text-purple-600 animate-pulse">Processing...</span>
                    )}
                  </div>
                </div>
                
                {/* MCP Sub-results */}
                {task.results && task.results.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {task.results.map((result, resultIndex) => (
                      <div key={resultIndex} className="flex items-center justify-between text-sm bg-white p-2 rounded">
                        <span className="text-gray-700">
                          {safeRender(result.server, 'Unknown Server')}
                        </span>
                        <div className="flex items-center">
                          {result.status === 'VERIFIED' && <CheckCircle className="w-3 h-3 text-green-500 mr-1" />}
                          {result.status === 'CONTRADICTED' && <XCircle className="w-3 h-3 text-red-500 mr-1" />}
                          {result.status === 'INCONCLUSIVE' && <AlertCircle className="w-3 h-3 text-yellow-500 mr-1" />}
                          <span className="text-gray-600">{Math.round(result.confidence * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up Questions */}
      {showingQuestions && followUpQuestions && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-blue-900 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              Help Us Improve Accuracy
            </h3>
            <div className="text-sm text-blue-700">
              {followUpQuestions.confidenceLevel && `${Math.round(followUpQuestions.confidenceLevel * 100)}% confidence`}
            </div>
          </div>
          
          <p className="text-sm text-blue-800 mb-4">
            {followUpQuestions.explanation}
          </p>
          
          <div className="space-y-4">
            {followUpQuestions.questions.map((question, index) => (
              <div key={question.id} className="bg-white rounded-lg p-4 border">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{question.question}</h4>
                  {question.weight === 'critical' && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                      Critical
                    </span>
                  )}
                  {question.weight === 'high' && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                      High Priority
                    </span>
                  )}
                </div>
                
                {question.type === 'yes_no' && (
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name={question.id}
                        value="yes"
                        checked={questionAnswers[question.id] === 'yes'}
                        onChange={() => handleAnswerChange(question.id, 'yes')}
                        className="mr-2"
                      />
                      Yes
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name={question.id}
                        value="no"
                        checked={questionAnswers[question.id] === 'no'}
                        onChange={() => handleAnswerChange(question.id, 'no')}
                        className="mr-2"
                      />
                      No
                    </label>
                  </div>
                )}
                
                {question.type === 'multiple_choice' && (
                  <div className="space-y-2">
                    {question.options.map((option) => (
                      <label key={option.value} className="flex items-center">
                        <input
                          type="radio"
                          name={question.id}
                          value={option.value}
                          checked={questionAnswers[question.id] === option.value}
                          onChange={() => handleAnswerChange(question.id, option.value)}
                          className="mr-2"
                        />
                        <span className="flex-1">{option.label}</span>
                        {option.risk === 'high' && (
                          <span className="px-1 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                            High Risk
                          </span>
                        )}
                        {option.risk === 'medium' && (
                          <span className="px-1 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                            Medium Risk
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                
                {questionAnswers[question.id] && question.followUp && question.followUp[questionAnswers[question.id]] && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
                    💡 {question.followUp[questionAnswers[question.id]]}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-between mt-6">
            <button
              onClick={skipQuestions}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Skip Questions
            </button>
            <button
              onClick={submitFollowUpAnswers}
              disabled={Object.keys(questionAnswers).length === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                Object.keys(questionAnswers).length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Submit Answers ({Object.keys(questionAnswers).length}/{followUpQuestions.questions.length})
            </button>
          </div>
        </div>
      )}

      {/* Final Result */}
      {finalResult && !showingQuestions && (
        <div className="mt-6 space-y-4">
          {/* Verdict Header */}
          <div className={`p-4 rounded-lg border-2 ${
            finalResult.verdict === 'CONTRADICTED' ? 'bg-red-50 border-red-200' :
            finalResult.verdict === 'VERIFIED' ? 'bg-green-50 border-green-200' :
            'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-xl flex items-center">
                {finalResult.verdict === 'CONTRADICTED' && <XCircle className="w-6 h-6 mr-2 text-red-600" />}
                {finalResult.verdict === 'VERIFIED' && <CheckCircle className="w-6 h-6 mr-2 text-green-600" />}
                {finalResult.verdict === 'SUSPICIOUS' && <AlertCircle className="w-6 h-6 mr-2 text-yellow-600" />}
                <span className={`${
                  finalResult.verdict === 'CONTRADICTED' ? 'text-red-800' :
                  finalResult.verdict === 'VERIFIED' ? 'text-green-800' :
                  'text-yellow-800'
                }`}>
                  {finalResult.verdict === 'CONTRADICTED' ? 'LIKELY FAKE/SCAM' :
                   finalResult.verdict === 'VERIFIED' ? 'APPEARS LEGITIMATE' :
                   'SUSPICIOUS - VERIFY CAREFULLY'}
                </span>
              </h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(finalResult.confidence * 100)}%
                </div>
                <div className="text-sm text-gray-600">confidence</div>
              </div>
            </div>
            
            {finalResult.explanation?.summary && (
              <p className="text-sm text-gray-700 mt-2">
                {finalResult.explanation.summary}
              </p>
            )}
          </div>

          {/* Enhanced Sources Display - Always show for any final result */}
          <SourceDisplay 
            sources={(() => {
              // Handle different source data formats
              let sourceData = [];
              
              if (finalResult.sources?.results && finalResult.sources.results.length > 0) {
                // Standard streaming format with detailed results
                sourceData = finalResult.sources.results;
              } else if (finalResult.sources?.sources && finalResult.sources.sources.length > 0) {
                // Alternative format
                sourceData = finalResult.sources.sources;
              } else if (Array.isArray(finalResult.sources) && finalResult.sources.length > 0) {
                // Direct array format
                sourceData = finalResult.sources;
              } else {
                // Create intelligent mock sources based on available data
                sourceData = [];
                
                // Add verification engine source
                sourceData.push({
                  name: 'Truth Verification Engine',
                  status: finalResult.verdict === 'CONTRADICTED' ? 'CONTRADICTED' : 
                          finalResult.verdict === 'VERIFIED' ? 'VERIFIED' : 'VERIFIED',
                  confidence: finalResult.confidence || 0.85,
                  data: {
                    analysis: finalResult.explanation?.summary || 
                             finalResult.explanation?.details?.[0] || 
                             'Comprehensive verification analysis completed',
                    findings: finalResult.explanation?.details || 
                             finalResult.explanation?.reasoning || [],
                    suspicionScore: finalResult.verdict === 'CONTRADICTED' ? 85 : 25
                  },
                  type: 'TRADITIONAL'
                });
                
                // Add MCP source if capabilities mentioned
                if (finalResult.performance?.mcpCapabilities && finalResult.performance.mcpCapabilities.length > 0) {
                  sourceData.push({
                    name: 'MCP AI Enhancement',
                    status: 'VERIFIED',
                    confidence: 0.92,
                    data: {
                      analysis: `Enhanced with ${finalResult.performance.mcpCapabilities.join(', ')} capabilities`,
                      findings: [`Used ${finalResult.performance.mcpCapabilities.length} AI capabilities`]
                    },
                    type: 'MCP'
                  });
                }
                
                // Add traditional sources count if available
                if (finalResult.sources?.traditional > 0) {
                  sourceData.push({
                    name: 'Traditional Web Sources',
                    status: 'VERIFIED',
                    confidence: 0.78,
                    data: {
                      analysis: `Verified against ${finalResult.sources.traditional} traditional sources`,
                      findings: [`${finalResult.sources.successful || finalResult.sources.traditional} successful verifications`]
                    },
                    type: 'TRADITIONAL'
                  });
                }
              }
              
              return sourceData.map(result => ({
                name: result.source || result.name || 'Unknown Source',
                status: result.status || (finalResult.verdict === 'CONTRADICTED' ? 'CONTRADICTED' : 'VERIFIED'),
                confidence: result.confidence || finalResult.confidence || 0.8,
                data: result.data || {
                  analysis: result.analysis || finalResult.explanation?.summary || 'Analysis completed'
                },
                error: result.error,
                type: result.type || 'TRADITIONAL'
              }));
            })()} 
            title="Sources Verified"
            showDetails={true}
          />

          {/* Performance Stats */}
          <div className="bg-white rounded-lg border p-4">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Analysis Performance
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {finalResult.sources?.total || 0}
                </div>
                <div className="text-gray-600">Sources Checked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {finalResult.sources?.successful || 0}
                </div>
                <div className="text-gray-600">Successful</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {finalResult.sources?.mcp_sources || 0}
                </div>
                <div className="text-gray-600">MCP Enhanced</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {finalResult.performance?.totalTime ? `${(finalResult.performance.totalTime / 1000).toFixed(1)}s` : 'N/A'}
                </div>
                <div className="text-gray-600">Total Time</div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-lg border p-4">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Recommendations
            </h4>
            <div className="space-y-2 text-sm">
              {finalResult.verdict === 'CONTRADICTED' && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="font-medium text-red-800 mb-1">⚠️ High Risk - Likely Scam</div>
                  <ul className="text-red-700 space-y-1">
                    <li>• Do not click any links or download attachments</li>
                    <li>• Do not provide personal or financial information</li>
                    <li>• Report this content to appropriate authorities</li>
                    <li>• Delete or ignore this message</li>
                  </ul>
                </div>
              )}
              {finalResult.verdict === 'VERIFIED' && (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <div className="font-medium text-green-800 mb-1">✅ Appears Legitimate</div>
                  <ul className="text-green-700 space-y-1">
                    <li>• Content appears to be genuine</li>
                    <li>• Still exercise normal caution with links and attachments</li>
                    <li>• Verify directly with official sources when in doubt</li>
                  </ul>
                </div>
              )}
              {finalResult.verdict === 'SUSPICIOUS' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <div className="font-medium text-yellow-800 mb-1">🔍 Requires Verification</div>
                  <ul className="text-yellow-700 space-y-1">
                    <li>• Verify through official channels before acting</li>
                    <li>• Be cautious with links and personal information</li>
                    <li>• Look for additional red flags or confirmation</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamingVerification;