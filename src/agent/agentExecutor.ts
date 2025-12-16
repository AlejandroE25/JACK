/**
 * Agent Executor
 *
 * Executes multi-step plans with parallel execution, error recovery,
 * and real-time progress updates via WebSocket.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { PluginRegistry } from '../plugins/pluginRegistry';
import { PermissionManager } from './permissionManager';
import { AuditLogger } from './auditLogger';
import {
  ExecutionPlan,
  ExecutionStep,
  PlanExecution,
  StepExecution,
  ExecutionStatus,
  ExecutionResult,
  ProgressUpdate,
  AuditEventType,
  ContextUpdate
} from '../types/agent';
import { ExecutionContext, ToolResult } from '../types/plugin';

export class AgentExecutor extends EventEmitter {
  private pluginRegistry: PluginRegistry;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private maxRetries: number;
  private stepTimeout: number;

  constructor(
    pluginRegistry: PluginRegistry,
    permissionManager: PermissionManager,
    auditLogger: AuditLogger,
    maxRetries: number = 2,
    stepTimeout: number = 30000
  ) {
    super();
    this.pluginRegistry = pluginRegistry;
    this.permissionManager = permissionManager;
    this.auditLogger = auditLogger;
    this.maxRetries = maxRetries;
    this.stepTimeout = stepTimeout;

    logger.info('Agent executor initialized');
  }

  /**
   * Execute a plan
   */
  async execute(
    plan: ExecutionPlan,
    clientId: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>,
    correlationId: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    logger.info(`Executing plan ${plan.id}`, {
      clientId,
      steps: plan.steps.length,
      correlationId
    });

    // Create plan execution tracker
    const execution: PlanExecution = {
      planId: plan.id,
      clientId,
      status: ExecutionStatus.RUNNING,
      stepExecutions: new Map(),
      results: new Map(),
      startedAt: new Date(),
      progressUpdates: []
    };

    // Initialize step executions
    for (const step of plan.steps) {
      execution.stepExecutions.set(step.id, {
        step,
        status: ExecutionStatus.PENDING,
        retryCount: 0
      });
    }

    // Emit initial progress
    this.emitProgress(execution, `Starting execution of ${plan.steps.length}-step plan...`, 0);

    // Audit log
    this.auditLogger.log(
      clientId,
      AuditEventType.EXECUTION_STARTED,
      { planId: plan.id, steps: plan.steps.length },
      correlationId
    );

    try {
      // Execute steps based on dependencies
      await this.executeSteps(plan.steps, execution, conversationHistory, correlationId);

      // Execution completed
      execution.status = ExecutionStatus.COMPLETED;
      execution.completedAt = new Date();

      const duration = Date.now() - startTime;
      const toolsUsed = Array.from(
        new Set(plan.steps.map((s) => s.toolName))
      );

      this.auditLogger.log(
        clientId,
        AuditEventType.EXECUTION_COMPLETED,
        { planId: plan.id, duration, toolsUsed },
        correlationId
      );

      this.emitProgress(execution, 'Execution completed successfully!', 100);

      return {
        success: true,
        finalAnswer: this.generateFinalAnswer(execution),
        stepResults: execution.results,
        duration,
        toolsUsed
      };
    } catch (error) {
      execution.status = ExecutionStatus.FAILED;
      execution.completedAt = new Date();

      const duration = Date.now() - startTime;

      logger.error('Plan execution failed', { error, planId: plan.id });

      this.auditLogger.log(
        clientId,
        AuditEventType.EXECUTION_FAILED,
        { planId: plan.id, error: (error as Error).message },
        correlationId
      );

      this.emitProgress(execution, `Execution failed: ${(error as Error).message}`, 100);

      return {
        success: false,
        finalAnswer: `I encountered an error: ${(error as Error).message}`,
        stepResults: execution.results,
        duration,
        toolsUsed: []
      };
    }
  }

  /**
   * Execute steps with dependency resolution and parallelization
   */
  private async executeSteps(
    steps: ExecutionStep[],
    execution: PlanExecution,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>,
    correlationId: string
  ): Promise<void> {
    const completed = new Set<string>();
    const remaining = new Set(steps.map((s) => s.id));

    while (remaining.size > 0) {
      // Find steps that can execute now (dependencies met)
      const ready = steps.filter((step) => {
        if (!remaining.has(step.id)) return false;
        return step.dependencies.every((dep) => completed.has(dep));
      });

      if (ready.length === 0) {
        throw new Error('Circular dependency detected or no steps can execute');
      }

      // Separate parallelizable from sequential steps
      const parallelSteps = ready.filter((s) => s.parallelizable);
      const sequentialSteps = ready.filter((s) => !s.parallelizable);

      // Execute parallel steps concurrently
      if (parallelSteps.length > 0) {
        await Promise.all(
          parallelSteps.map((step) =>
            this.executeStep(step, execution, conversationHistory, correlationId)
          )
        );

        for (const step of parallelSteps) {
          completed.add(step.id);
          remaining.delete(step.id);
        }
      }

      // Execute sequential steps one by one
      for (const step of sequentialSteps) {
        await this.executeStep(step, execution, conversationHistory, correlationId);
        completed.add(step.id);
        remaining.delete(step.id);
      }

      // Update progress
      const progress = (completed.size / steps.length) * 100;
      this.emitProgress(
        execution,
        `Completed ${completed.size}/${steps.length} steps`,
        progress
      );
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: ExecutionStep,
    execution: PlanExecution,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>,
    correlationId: string
  ): Promise<void> {
    const stepExecution = execution.stepExecutions.get(step.id)!;

    logger.info(`Executing step: ${step.id} (${step.toolName})`, {
      description: step.description
    });

    stepExecution.status = ExecutionStatus.RUNNING;
    stepExecution.startedAt = new Date();

    this.emitProgress(execution, step.description, undefined, step.id);

    try {
      // Check if permission is required
      if (step.requiresPermission) {
        stepExecution.status = ExecutionStatus.AWAITING_PERMISSION;

        const response = await this.permissionManager.requestPermission(
          execution.clientId,
          step.id,
          step.toolName,
          step.description,
          step.parameters,
          step.requiresPermission
            ? require('../types/agent').PermissionLevel.REQUIRE_CONFIRMATION
            : require('../types/agent').PermissionLevel.AUTO_APPROVE
        );

        this.auditLogger.log(
          execution.clientId,
          response.approved
            ? AuditEventType.PERMISSION_GRANTED
            : AuditEventType.PERMISSION_DENIED,
          {
            stepId: step.id,
            toolName: step.toolName,
            reason: response.reason
          },
          correlationId
        );

        if (!response.approved) {
          throw new Error(`Permission denied: ${response.reason || 'User declined'}`);
        }

        stepExecution.status = ExecutionStatus.RUNNING;
      }

      // Get the tool
      const tool = this.pluginRegistry.getTool(step.toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${step.toolName}`);
      }

      // Build execution context
      const context: ExecutionContext = {
        clientId: execution.clientId,
        conversationHistory,
        previousStepResults: execution.results
      };

      // Execute tool with timeout
      const result = await this.executeWithTimeout(
        tool.execute(step.parameters, context),
        this.stepTimeout
      );

      // Store result
      execution.results.set(step.id, result);
      stepExecution.result = result;
      stepExecution.status = ExecutionStatus.COMPLETED;
      stepExecution.completedAt = new Date();

      this.auditLogger.log(
        execution.clientId,
        AuditEventType.TOOL_EXECUTED,
        {
          stepId: step.id,
          toolName: step.toolName,
          success: result.success,
          duration: result.metadata?.duration
        },
        correlationId
      );

      logger.info(`Step ${step.id} completed successfully`);
    } catch (error) {
      logger.error(`Step ${step.id} failed`, { error });

      // Retry logic
      if (stepExecution.retryCount < this.maxRetries) {
        stepExecution.retryCount++;
        logger.info(`Retrying step ${step.id} (attempt ${stepExecution.retryCount + 1})`);

        // Wait before retry (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, stepExecution.retryCount) * 1000)
        );

        // Retry
        return this.executeStep(step, execution, conversationHistory, correlationId);
      }

      stepExecution.status = ExecutionStatus.FAILED;
      stepExecution.error = error as Error;
      stepExecution.completedAt = new Date();

      throw error;
    }
  }

  /**
   * Execute promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Step execution timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Emit progress update
   */
  private emitProgress(
    execution: PlanExecution,
    message: string,
    percentage?: number,
    stepId?: string
  ): void {
    const update: ProgressUpdate = {
      timestamp: new Date(),
      message,
      stepId,
      percentage: percentage ?? 0
    };

    execution.progressUpdates.push(update);
    this.emit('progress', { planId: execution.planId, update });

    logger.debug(`Progress: ${message}`, { percentage, stepId });
  }

  /**
   * Generate final answer from execution results
   */
  private generateFinalAnswer(execution: PlanExecution): string {
    const results: string[] = [];

    for (const [stepId, result] of execution.results.entries()) {
      const stepExecution = execution.stepExecutions.get(stepId);
      if (!stepExecution) continue;

      const step = stepExecution.step;

      if (result.success && result.data) {
        // Use formatted output if available
        if (result.data.formatted) {
          results.push(result.data.formatted);
        } else if (typeof result.data === 'string') {
          results.push(result.data);
        } else if (result.data.message) {
          results.push(result.data.message);
        }
      }
    }

    return results.length > 0
      ? results.join('\n\n')
      : 'Task completed successfully!';
  }

  /**
   * Process context update during execution
   * Returns true if execution should continue, false if cancelled
   */
  async processContextUpdate(
    execution: PlanExecution,
    update: ContextUpdate,
    agentPlanner: any // Import would be circular, using any for now
  ): Promise<boolean> {
    logger.info(`Processing context update for plan ${execution.planId}`, {
      updateMessage: update.message
    });

    // Get completed step IDs
    const completedStepIds = Array.from(execution.stepExecutions.entries())
      .filter(([_, stepExec]) => stepExec.status === ExecutionStatus.COMPLETED)
      .map(([id, _]) => id);

    // Get original plan from execution
    const originalPlan = {
      id: execution.planId,
      originalQuery: '', // Would need to store this
      steps: Array.from(execution.stepExecutions.values()).map((se) => se.step),
      estimatedTotalDuration: 0,
      requiresUserPermission: false,
      createdAt: execution.startedAt
    };

    try {
      // Ask planner to update plan
      const updatedPlan = await agentPlanner.updatePlanWithContext(
        originalPlan,
        update.message,
        completedStepIds
      );

      if (updatedPlan === null) {
        // Plan cancelled
        execution.status = ExecutionStatus.CANCELLED;
        return false;
      }

      // Plan was updated - emit event for orchestrator to handle
      this.emit('plan_updated', { execution, updatedPlan, update });

      return true;
    } catch (error) {
      logger.error('Failed to process context update', { error });
      // Continue with original plan on error
      return true;
    }
  }
}