/**
 * Streaming Verification Engine
 * Provides real-time streaming of verification results as they complete
 */
const { EventEmitter } = require('events');
const MCPVerificationEngine = require('../verification/MCPVerificationEngine');

class StreamingVerificationEngine extends MCPVerificationEngine {
  constructor() {
    super();
    this.activeStreams = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the streaming verification engine
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Initialize the parent MCP verification engine
      await super.initialize();
      this.initialized = true;
      console.log('🎬 Streaming Verification Engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize streaming verification engine:', error.message);
      throw error;
    }
  }

  /**
   * Start streaming verification process
   */
  async startStreamingVerification(text, options = {}) {
    // Ensure we're initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const streamId = this.generateStreamId();
    const stream = new VerificationStream(streamId, text, options);
    
    this.activeStreams.set(streamId, stream);
    
    // Start the verification process
    setImmediate(() => {
      this.executeStreamingVerification(stream);
    });
    
    return {
      streamId,
      stream: stream.eventEmitter
    };
  }

  /**
   * Execute streaming verification with real-time updates
   */
  async executeStreamingVerification(stream) {
    const { text, options } = stream;
    
    try {
      // Emit initial status
      stream.emit('status', {
        stage: 'initializing',
        message: 'Starting verification process...',
        progress: 0
      });

      // Step 1: Context Detection
      stream.emit('status', {
        stage: 'context_detection',
        message: 'Analyzing context and claim types...',
        progress: 10
      });

      const context = await this.detectContextSafely(text);
      
      stream.emit('context_detected', {
        context: this.summarizeContextSafely(context),
        claimTypes: context.claimTypes || ['general'],
        entities: context.entities || [],
        temporal: context.temporal || { recency: 'MEDIUM' },
        strategy: context.strategy || 'standard'
      });

      // Step 2: Plan verification strategy
      stream.emit('status', {
        stage: 'planning',
        message: 'Planning verification strategy...',
        progress: 20
      });

      const verificationPlan = this.planStreamingVerification(text, context);
      
      stream.emit('plan_created', {
        plan: verificationPlan,
        totalSources: verificationPlan.sources.length + verificationPlan.mcpTasks.length
      });

      // Step 3: Execute sources in parallel with streaming
      stream.emit('status', {
        stage: 'verification',
        message: 'Executing verification from multiple sources...',
        progress: 30
      });

      await this.executeParallelVerificationWithStreaming(stream, verificationPlan);

      // Step 4: Finalize results
      stream.emit('status', {
        stage: 'finalizing',
        message: 'Analyzing results and generating final verdict...',
        progress: 90
      });

      const finalResult = this.generateFinalStreamingResult(stream);
      
      stream.emit('final_result', finalResult);
      
      stream.emit('status', {
        stage: 'completed',
        message: 'Verification completed!',
        progress: 100
      });

    } catch (error) {
      stream.emit('error', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Clean up after 5 minutes
      setTimeout(() => {
        this.activeStreams.delete(stream.id);
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Plan streaming verification strategy
   */
  planStreamingVerification(text, context) {
    const plan = {
      sources: [],
      mcpTasks: [],
      priority: 'MEDIUM',
      estimatedTime: 30000
    };

    try {
      // Traditional sources (fast, run first)
      if (this.sourceRegistry && this.sourceRegistry.selectSourcesForVerification) {
        const traditionalSources = this.sourceRegistry.selectSourcesForVerification(text, context, 2);
        plan.sources = traditionalSources.map(source => ({
          name: source.name,
          type: source.type,
          reliability: source.reliability,
          expectedTime: 3000,
          priority: 1
        }));
      } else {
        // Fallback sources if registry not available
        plan.sources = [
          {
            name: 'Enhanced Pattern Detection',
            type: 'pattern',
            reliability: 0.7,
            expectedTime: 1000,
            priority: 1
          },
          {
            name: 'Context Analysis',
            type: 'context',
            reliability: 0.8,
            expectedTime: 2000,
            priority: 1
          }
        ];
      }

      // MCP tasks (slower, run in parallel)
      if (this.planMCPVerification) {
        const mcpTasks = this.planMCPVerification(text, context);
        plan.mcpTasks = mcpTasks.map(task => ({
          ...task,
          expectedTime: 10000,
          priority: 2
        }));
      } else {
        // Fallback MCP tasks
        plan.mcpTasks = [
          {
            capability: 'web_search',
            parameters: { query: text.substring(0, 100) },
            expectedTime: 8000,
            priority: 2
          }
        ];
      }

      // Adjust priority based on context
      if (context && context.temporal && context.temporal.recency === 'HIGH') {
        plan.priority = 'HIGH';
        plan.estimatedTime = 20000;
      }

    } catch (error) {
      console.warn('⚠️ Error planning verification, using fallback:', error.message);
      // Minimal fallback plan
      plan.sources = [{
        name: 'Basic Analysis',
        type: 'fallback',
        reliability: 0.5,
        expectedTime: 2000,
        priority: 1
      }];
    }

    return plan;
  }

  /**
   * Execute verification with real-time streaming
   */
  async executeParallelVerificationWithStreaming(stream, plan) {
    const allTasks = [
      ...plan.sources.map(source => ({
        type: 'traditional',
        source,
        execute: () => this.executeTraditionalSourceWithStreaming(stream, source)
      })),
      ...plan.mcpTasks.map(task => ({
        type: 'mcp',
        task,
        execute: () => this.executeMCPTaskWithStreaming(stream, task)
      }))
    ];

    // Execute all tasks in parallel
    const results = await Promise.allSettled(
      allTasks.map(async (task) => {
        const startTime = Date.now();
        
        try {
          const result = await task.execute();
          const responseTime = Date.now() - startTime;
          
          return {
            ...result,
            type: task.type,
            responseTime,
            success: true
          };
        } catch (error) {
          const responseTime = Date.now() - startTime;
          
          return {
            type: task.type,
            name: task.source?.name || task.task?.capability,
            error: error.message,
            responseTime,
            success: false
          };
        }
      })
    );

    // Store results in stream
    stream.results = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * Execute traditional source with streaming updates
   */
  async executeTraditionalSourceWithStreaming(stream, source) {
    stream.emit('source_started', {
      source: source.name,
      type: 'traditional',
      reliability: source.reliability,
      expectedTime: source.expectedTime
    });

    try {
      const result = await this.verifyWithSource(
        this.sourceRegistry.getSource(source.name),
        stream.text,
        stream.context,
        15000
      );

      stream.emit('source_completed', {
        source: source.name,
        type: 'traditional',
        status: result.status,
        confidence: result.confidence,
        data: result.data,
        responseTime: result.responseTime
      });

      return result;
      
    } catch (error) {
      stream.emit('source_failed', {
        source: source.name,
        type: 'traditional',
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Execute MCP task with streaming updates
   */
  async executeMCPTaskWithStreaming(stream, task) {
    stream.emit('mcp_started', {
      capability: task.capability,
      parameters: task.parameters,
      expectedTime: task.expectedTime
    });

    try {
      const result = await this.mcpOrchestrator.executeCapability(
        task.capability,
        task.parameters
      );

      // Process MCP results
      const processedResults = [];
      
      for (const mcpResult of result.results) {
        if (mcpResult.success) {
          const status = this.interpretMCPResult(mcpResult);
          const confidence = this.calculateMCPConfidence(mcpResult);
          
          processedResults.push({
            server: mcpResult.server,
            status,
            confidence,
            data: mcpResult.result,
            responseTime: mcpResult.responseTime
          });

          stream.emit('mcp_source_completed', {
            server: mcpResult.server,
            capability: task.capability,
            status,
            confidence,
            responseTime: mcpResult.responseTime,
            data: mcpResult.result
          });
        } else {
          stream.emit('mcp_source_failed', {
            server: mcpResult.server,
            capability: task.capability,
            error: mcpResult.error
          });
        }
      }

      stream.emit('mcp_completed', {
        capability: task.capability,
        totalResults: processedResults.length,
        summary: result.summary
      });

      return {
        capability: task.capability,
        results: processedResults,
        summary: result.summary
      };

    } catch (error) {
      stream.emit('mcp_failed', {
        capability: task.capability,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Generate final streaming result
   */
  generateFinalStreamingResult(stream) {
    const allResults = stream.results || [];
    const traditionalResults = allResults.filter(r => r.type === 'traditional');
    const mcpResults = allResults.filter(r => r.type === 'mcp');

    // Flatten MCP results
    const flattenedResults = [];
    
    for (const traditional of traditionalResults) {
      if (traditional.success) {
        flattenedResults.push({
          source: traditional.name,
          type: 'TRADITIONAL',
          status: traditional.status,
          confidence: traditional.confidence,
          data: traditional.data,
          responseTime: traditional.responseTime
        });
      }
    }

    for (const mcp of mcpResults) {
      if (mcp.success && mcp.results) {
        for (const result of mcp.results) {
          flattenedResults.push({
            source: `MCP-${result.server}`,
            type: 'MCP',
            status: result.status,
            confidence: result.confidence,
            data: result.data,
            responseTime: result.responseTime,
            capability: mcp.capability
          });
        }
      }
    }

    // Calculate enhanced consensus
    const consensus = this.calculateEnhancedConsensus(flattenedResults);
    const verdict = this.determineEnhancedVerdict(consensus, flattenedResults, stream.context);
    const confidence = this.calculateEnhancedConfidence(flattenedResults, consensus);
    const explanation = this.generateEnhancedExplanation(flattenedResults, consensus, stream.context);

    return {
      success: true,
      verdict,
      confidence,
      consensus,
      explanation,
      sources: {
        total: flattenedResults.length,
        traditional: traditionalResults.length,
        mcp: mcpResults.length,
        successful: flattenedResults.filter(r => r.status === 'VERIFIED').length,
        results: flattenedResults
      },
      performance: {
        totalTime: Date.now() - stream.startTime,
        sourcesChecked: flattenedResults.length,
        mcpCapabilities: mcpResults.map(r => r.capability).filter(Boolean),
        averageResponseTime: flattenedResults.reduce((sum, r) => sum + r.responseTime, 0) / flattenedResults.length
      },
      metadata: {
        method: 'streaming_verification',
        timestamp: new Date().toISOString(),
        streamId: stream.id
      }
    };
  }

  /**
   * Safely detect context with fallback
   */
  async detectContextSafely(text) {
    try {
      if (this.contextDetector && this.contextDetector.detectContext) {
        return await this.contextDetector.detectContext(text);
      }
    } catch (error) {
      console.warn('⚠️ Context detection failed, using fallback:', error.message);
    }
    
    // Fallback context detection
    return this.createFallbackContext(text);
  }

  /**
   * Create fallback context when full detection isn't available
   */
  createFallbackContext(text) {
    const lowerText = text.toLowerCase();
    
    // Basic claim type detection
    const claimTypes = [];
    if (lowerText.includes('money') || lowerText.includes('prize') || lowerText.includes('win')) {
      claimTypes.push('financial');
    }
    if (lowerText.includes('urgent') || lowerText.includes('expires')) {
      claimTypes.push('temporal');
    }
    if (lowerText.includes('http') || lowerText.includes('www')) {
      claimTypes.push('web');
    }
    if (claimTypes.length === 0) {
      claimTypes.push('general');
    }

    // Basic entity detection
    const entities = [];
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/g);
    if (emailMatch) {
      entities.push(...emailMatch.map(email => ({ type: 'email', value: email })));
    }
    
    const urlMatch = text.match(/https?:\/\/[\w.-]+/g);
    if (urlMatch) {
      entities.push(...urlMatch.map(url => ({ type: 'url', value: url })));
    }

    return {
      claimTypes,
      entities,
      temporal: { 
        recency: lowerText.includes('urgent') || lowerText.includes('expires') ? 'HIGH' : 'MEDIUM' 
      },
      strategy: 'fallback'
    };
  }

  /**
   * Safely summarize context with fallback
   */
  summarizeContextSafely(context) {
    if (this.contextDetector && this.contextDetector.summarizeContext) {
      try {
        return this.contextDetector.summarizeContext(context);
      } catch (error) {
        console.warn('⚠️ Context summarization failed, using fallback');
      }
    }
    
    // Fallback summary
    return `Detected ${context.claimTypes?.length || 0} claim types, ${context.entities?.length || 0} entities`;
  }

  /**
   * Generate unique stream ID
   */
  generateStreamId() {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * Get stream by ID
   */
  getStream(streamId) {
    return this.activeStreams.get(streamId);
  }

  /**
   * Cleanup
   */
  async cleanup() {
    // Clean up all active streams
    for (const [streamId, stream] of this.activeStreams) {
      stream.emit('cleanup', { message: 'Server shutting down' });
    }
    
    this.activeStreams.clear();
    
    await super.cleanup();
  }
}

/**
 * Verification Stream class
 */
class VerificationStream {
  constructor(id, text, options = {}) {
    this.id = id;
    this.text = text;
    this.options = options;
    this.startTime = Date.now();
    this.eventEmitter = new EventEmitter();
    this.results = [];
    this.context = null;
  }

  emit(event, data) {
    this.eventEmitter.emit(event, {
      ...data,
      streamId: this.id,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = StreamingVerificationEngine;