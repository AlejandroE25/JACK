/**
 * Agent Orchestrator
 *
 * Main coordinator for the agent system. Integrates planner, executor,
 * permission manager, and concurrent request manager for complete agent functionality.
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { PluginRegistry } from '../plugins/pluginRegistry';
import { AgentPlanner } from './agentPlanner';
import { AgentExecutor } from './agentExecutor';
import { PermissionManager } from './permissionManager';
import { AuditLogger } from './auditLogger';
import { ConcurrentRequestManager } from './concurrentRequestManager';
import {
  ExecutionResult,
  PlanningContext,
  AuditEventType,
  TaskState
} from '../types/agent';

export class AgentOrchestrator {
  private pluginRegistry: PluginRegistry;
  private planner: AgentPlanner;
  private executor: AgentExecutor;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private concurrentRequestManager: ConcurrentRequestManager;

  /** Conversation history per client */
  private conversationHistory: Map<
    string,
    Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>
  >;

  constructor(
    anthropicApiKey: string,
    pluginRegistry: PluginRegistry,
    auditDbPath: string = './data/audit.db',
    planningModel: string = 'claude-sonnet-4-20250514'
  ) {
    this.pluginRegistry = pluginRegistry;
    this.conversationHistory = new Map();

    // Initialize components
    this.auditLogger = new AuditLogger(auditDbPath);
    this.permissionManager = new PermissionManager();
    this.concurrentRequestManager = new ConcurrentRequestManager();
    this.planner = new AgentPlanner(anthropicApiKey, pluginRegistry, planningModel);
    this.executor = new AgentExecutor(
      pluginRegistry,
      this.permissionManager,
      this.auditLogger,
      anthropicApiKey
    );

    // Setup event handlers
    this.setupEventHandlers();

    logger.info('Agent orchestrator initialized');
  }

  /**
   * Setup event handlers for cross-component communication
   */
  private setupEventHandlers(): void {
    // Permission requests -> emit for WebSocket
    this.permissionManager.on('permission_request', (request) => {
      logger.debug('Permission request event', { requestId: request.id });
      // Will be forwarded to WebSocket by server
    });

    // Progress updates -> emit for WebSocket
    this.executor.on('progress', (data) => {
      logger.debug('Progress update event', { planId: data.planId });
      // Will be forwarded to WebSocket by server
    });

    // Task state changes
    this.concurrentRequestManager.on('task_state_changed', (task) => {
      logger.debug('Task state changed', {
        taskId: task.taskId,
        state: task.state
      });
    });

    // Context updates
    this.concurrentRequestManager.on('context_update', ({ task, update }) => {
      logger.info('Context update received', {
        taskId: task.taskId,
        message: update.message
      });

      // Process context update if task is active
      if (task.state === TaskState.ACTIVE && task.execution) {
        this.executor.processContextUpdate(task.execution, update, this.planner);
      }
    });
  }

  /**
   * Process a user message (main entry point)
   */
  async processMessage(clientId: string, message: string): Promise<string> {
    const correlationId = randomUUID();

    logger.info('Processing message', { clientId, message, correlationId });

    // Audit log
    this.auditLogger.log(
      clientId,
      AuditEventType.QUERY_RECEIVED,
      { query: message },
      correlationId
    );

    // Get or initialize conversation history
    if (!this.conversationHistory.has(clientId)) {
      this.conversationHistory.set(clientId, []);
    }
    const history = this.conversationHistory.get(clientId)!;

    // Add user message to history
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    try {
      // Check if this message relates to an active task
      const relatedTask = this.concurrentRequestManager.findRelatedTask(clientId, message);

      if (relatedTask && (relatedTask.state === TaskState.ACTIVE || relatedTask.state === TaskState.PAUSED)) {
        // This is a context update for an active task
        logger.info('Message identified as context update for active task', {
          taskId: relatedTask.taskId,
          originalQuery: relatedTask.query
        });

        this.concurrentRequestManager.addContextUpdate(relatedTask.taskId, message);

        return `I've updated the plan for "${relatedTask.query}" based on your new information. I'll incorporate this and continue working on it.`;
      }

      // New task - create and execute in background
      const task = this.concurrentRequestManager.createTask(clientId, message);

      logger.info('Created new task', { taskId: task.taskId, clientId });

      // Fire off execution in background (non-blocking)
      this.executeTaskInBackground(task.taskId, clientId, message, history, correlationId);

      // Return immediately
      return `🔍 Working on it... (Task ${task.taskId.slice(0, 8)})`;
    } catch (error) {
      logger.error('Error processing message', { error, clientId });

      this.auditLogger.log(
        clientId,
        AuditEventType.EXECUTION_FAILED,
        { error: (error as Error).message },
        correlationId
      );

      return `I encountered an error: ${(error as Error).message}`;
    }
  }

  /**
   * Execute task in background (non-blocking)
   */
  private executeTaskInBackground(
    taskId: string,
    clientId: string,
    query: string,
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>,
    correlationId: string
  ): void {
    const task = this.concurrentRequestManager.getTask(taskId);
    if (!task) {
      logger.error('Task not found for background execution', { taskId });
      return;
    }

    // Execute asynchronously
    (async () => {
      try {
        // Update task state
        this.concurrentRequestManager.updateTaskState(taskId, TaskState.ACTIVE);

        // Build planning context
        const planningContext: PlanningContext = {
          clientId,
          conversationHistory,
          memories: [], // TODO: Integrate memory service
          globalContext: [], // TODO: Integrate global context
          availableTools: this.pluginRegistry.getAllTools().map((t) => t.name)
        };

        // Create plan
        const plan = await this.planner.createPlan(query, planningContext);

        task.planId = plan.id;

        this.auditLogger.log(
          clientId,
          AuditEventType.PLAN_CREATED,
          { planId: plan.id, steps: plan.steps.length },
          correlationId
        );

        logger.info('Plan created', {
          taskId,
          planId: plan.id,
          steps: plan.steps.length
        });

        // Execute plan
        const result = await this.executor.execute(
          plan,
          clientId,
          conversationHistory,
          correlationId
        );

        // Complete task
        this.concurrentRequestManager.completeTask(taskId, result);

        // Add assistant response to conversation history
        conversationHistory.push({
          role: 'assistant',
          content: result.finalAnswer,
          timestamp: new Date()
        });

        // Emit result for WebSocket to send
        this.executor.emit('task_completed', {
          taskId,
          clientId,
          result
        });

        logger.info('Task completed successfully', { taskId, clientId });
      } catch (error) {
        logger.error('Background task execution failed', {
          taskId,
          error
        });

        this.concurrentRequestManager.updateTaskState(taskId, TaskState.FAILED);

        this.executor.emit('task_failed', {
          taskId,
          clientId,
          error: (error as Error).message
        });
      }
    })();
  }

  /**
   * Handle permission response from user
   */
  handlePermissionResponse(
    requestId: string,
    approved: boolean,
    reason?: string
  ): void {
    this.permissionManager.respondToPermission(requestId, approved, reason);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    this.concurrentRequestManager.cancelTask(taskId);
  }

  /**
   * Get active tasks for a client
   */
  getActiveTasksForClient(clientId: string) {
    return this.concurrentRequestManager.getActiveTasksForClient(clientId);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      tasks: this.concurrentRequestManager.getStatistics(),
      permissions: this.permissionManager.getStatistics(),
      audit: this.auditLogger.getStatistics()
    };
  }

  /**
   * Get permission manager (for WebSocket integration)
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  /**
   * Get executor (for WebSocket integration)
   */
  getExecutor(): AgentExecutor {
    return this.executor;
  }

  /**
   * Get audit logger
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.auditLogger.close();
    logger.info('Agent orchestrator shut down');
  }
}
