/**
 * Parallel Processing Engine for MCP Operations
 * Optimizes performance through intelligent parallel execution and resource management
 */
const { EventEmitter } = require('events');
const { Worker } = require('worker_threads');

class ParallelProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConcurrentTasks = options.maxConcurrentTasks || 8;
    this.taskTimeout = options.taskTimeout || 30000;
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.workers = new Map();
    this.taskStats = {
      total: 0,
      successful: 0,
      failed: 0,
      timeouts: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Execute multiple MCP capabilities in parallel with intelligent batching
   */
  async executeParallel(tasks, options = {}) {
    const {
      maxBatchSize = this.maxConcurrentTasks,
      timeout = this.taskTimeout,
      retryFailures = true,
      priorityOrdering = true
    } = options;

    console.log(`🚀 Starting parallel execution of ${tasks.length} tasks`);
    const startTime = Date.now();

    // Sort tasks by priority if enabled
    const sortedTasks = priorityOrdering ? this.prioritizeTasks(tasks) : tasks;
    
    // Split into batches for optimal performance
    const batches = this.createOptimalBatches(sortedTasks, maxBatchSize);
    const allResults = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} tasks)`);
      
      try {
        const batchResults = await this.executeBatch(batch, timeout);
        allResults.push(...batchResults);
        
        // Brief pause between batches to prevent resource exhaustion
        if (i < batches.length - 1) {
          await this.delay(100);
        }
        
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        // Continue with remaining batches
        allResults.push(...batch.map(task => ({
          taskId: task.id,
          success: false,
          error: `Batch execution failed: ${error.message}`,
          server: task.server || 'unknown'
        })));
      }
    }

    // Retry failed tasks if enabled
    if (retryFailures) {
      const failedTasks = allResults
        .filter(result => !result.success)
        .map(result => tasks.find(task => task.id === result.taskId))
        .filter(Boolean);
      
      if (failedTasks.length > 0) {
        console.log(`🔄 Retrying ${failedTasks.length} failed tasks`);
        const retryResults = await this.retryFailedTasks(failedTasks, timeout);
        
        // Replace failed results with retry results
        retryResults.forEach(retryResult => {
          const index = allResults.findIndex(r => r.taskId === retryResult.taskId);
          if (index !== -1) {
            allResults[index] = retryResult;
          }
        });
      }
    }

    const totalTime = Date.now() - startTime;
    this.updateGlobalStats(allResults, totalTime);

    console.log(`✅ Parallel execution completed in ${totalTime}ms`);
    console.log(`📊 Results: ${allResults.filter(r => r.success).length}/${allResults.length} successful`);

    return {
      results: allResults,
      performance: {
        totalTime,
        tasksExecuted: allResults.length,
        successRate: allResults.filter(r => r.success).length / allResults.length,
        averageResponseTime: allResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) / allResults.length,
        batchCount: batches.length
      },
      stats: this.taskStats
    };
  }

  /**
   * Execute a single batch of tasks in parallel
   */
  async executeBatch(tasks, timeout) {
    const promises = tasks.map(task => this.executeTask(task, timeout));
    
    try {
      const results = await Promise.allSettled(promises);
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            taskId: tasks[index].id,
            success: false,
            error: result.reason?.message || 'Unknown error',
            server: tasks[index].server || 'unknown',
            responseTime: timeout
          };
        }
      });
      
    } catch (error) {
      console.error('Batch execution error:', error);
      throw error;
    }
  }

  /**
   * Execute a single task with timeout and error handling
   */
  async executeTask(task, timeout) {
    const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    this.activeTasks.set(taskId, {
      ...task,
      startTime,
      timeout
    });

    try {
      // Create execution promise
      const executionPromise = this.performTaskExecution(task);
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task timeout')), timeout);
      });

      // Race between execution and timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;

      this.activeTasks.delete(taskId);

      return {
        taskId,
        success: true,
        result,
        responseTime,
        server: task.server || 'unknown',
        capability: task.capability,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.activeTasks.delete(taskId);

      const isTimeout = error.message.includes('timeout');
      if (isTimeout) {
        this.taskStats.timeouts++;
      }

      return {
        taskId,
        success: false,
        error: error.message,
        responseTime,
        server: task.server || 'unknown',
        capability: task.capability,
        isTimeout,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Perform the actual task execution (override in specific implementations)
   */
  async performTaskExecution(task) {
    if (task.execute && typeof task.execute === 'function') {
      return await task.execute();
    } else if (task.mcpServer && task.capability) {
      return await task.mcpServer.execute(task.capability, task.parameters || {});
    } else {
      throw new Error('Task has no valid execution method');
    }
  }

  /**
   * Prioritize tasks based on various factors
   */
  prioritizeTasks(tasks) {
    return tasks.sort((a, b) => {
      // Priority factors (higher score = higher priority)
      const scoreA = this.calculateTaskPriority(a);
      const scoreB = this.calculateTaskPriority(b);
      
      return scoreB - scoreA; // Sort descending
    });
  }

  /**
   * Calculate priority score for a task
   */
  calculateTaskPriority(task) {
    let score = 0;
    
    // Base priority
    score += task.priority || 0;
    
    // Capability-based priority
    if (task.capability) {
      switch (task.capability) {
        case 'web_search':
        case 'real_time_data':
          score += 10; // High priority for real-time operations
          break;
        case 'database_query':
          score += 8;
          break;
        case 'file_operations':
          score += 5;
          break;
        default:
          score += 3;
      }
    }
    
    // Server reliability factor
    if (task.server && task.server.averageResponseTime) {
      // Faster servers get higher priority
      score += Math.max(0, 10 - (task.server.averageResponseTime / 1000));
    }
    
    // Estimated execution time (shorter tasks first)
    if (task.estimatedTime) {
      score += Math.max(0, 10 - (task.estimatedTime / 5000));
    }
    
    return score;
  }

  /**
   * Create optimal batches based on task characteristics
   */
  createOptimalBatches(tasks, maxBatchSize) {
    const batches = [];
    let currentBatch = [];
    let currentBatchWeight = 0;
    
    for (const task of tasks) {
      const taskWeight = this.calculateTaskWeight(task);
      
      // Start new batch if current would exceed limits
      if (currentBatch.length >= maxBatchSize || 
          (currentBatchWeight + taskWeight > maxBatchSize * 2)) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBatchWeight = 0;
        }
      }
      
      currentBatch.push(task);
      currentBatchWeight += taskWeight;
    }
    
    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    return batches;
  }

  /**
   * Calculate task weight for batching optimization
   */
  calculateTaskWeight(task) {
    let weight = 1; // Base weight
    
    // Heavy operations get higher weight
    if (task.capability) {
      switch (task.capability) {
        case 'web_scraping':
        case 'image_processing':
          weight = 3;
          break;
        case 'database_query':
        case 'file_operations':
          weight = 2;
          break;
        default:
          weight = 1;
      }
    }
    
    // Factor in estimated time
    if (task.estimatedTime) {
      weight *= Math.max(1, task.estimatedTime / 5000);
    }
    
    return weight;
  }

  /**
   * Retry failed tasks with exponential backoff
   */
  async retryFailedTasks(failedTasks, timeout) {
    const retryResults = [];
    
    for (const task of failedTasks) {
      try {
        // Wait before retry (exponential backoff)
        await this.delay(1000);
        
        console.log(`🔄 Retrying task: ${task.capability} on ${task.server}`);
        const retryResult = await this.executeTask(task, timeout * 1.5); // Longer timeout for retry
        retryResults.push(retryResult);
        
      } catch (error) {
        retryResults.push({
          taskId: task.id,
          success: false,
          error: `Retry failed: ${error.message}`,
          server: task.server || 'unknown',
          isRetry: true
        });
      }
    }
    
    return retryResults;
  }

  /**
   * Update global statistics
   */
  updateGlobalStats(results, totalTime) {
    this.taskStats.total += results.length;
    this.taskStats.successful += results.filter(r => r.success).length;
    this.taskStats.failed += results.filter(r => !r.success).length;
    
    const totalResponseTime = results.reduce((sum, r) => sum + (r.responseTime || 0), 0);
    const avgResponseTime = totalResponseTime / results.length;
    
    // Update running average
    const totalTasks = this.taskStats.total;
    this.taskStats.avgResponseTime = 
      ((this.taskStats.avgResponseTime * (totalTasks - results.length)) + totalResponseTime) / totalTasks;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return {
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      stats: this.taskStats,
      averageResponseTime: this.taskStats.avgResponseTime,
      successRate: this.taskStats.total > 0 ? this.taskStats.successful / this.taskStats.total : 0,
      timeoutRate: this.taskStats.total > 0 ? this.taskStats.timeouts / this.taskStats.total : 0
    };
  }

  /**
   * Clear completed tasks and reset if needed
   */
  cleanup() {
    // Clear any timed-out tasks
    const now = Date.now();
    for (const [taskId, task] of this.activeTasks) {
      if (now - task.startTime > task.timeout * 2) {
        console.warn(`⚠️ Cleaning up stuck task: ${taskId}`);
        this.activeTasks.delete(taskId);
      }
    }
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down parallel processor...');
    
    // Wait for active tasks to complete (with timeout)
    const maxWaitTime = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (this.activeTasks.size > 0 && (Date.now() - startTime) < maxWaitTime) {
      console.log(`⏳ Waiting for ${this.activeTasks.size} active tasks to complete...`);
      await this.delay(1000);
    }
    
    // Force cleanup any remaining tasks
    this.activeTasks.clear();
    this.taskQueue.length = 0;
    
    console.log('✅ Parallel processor shut down gracefully');
  }
}

module.exports = ParallelProcessor;