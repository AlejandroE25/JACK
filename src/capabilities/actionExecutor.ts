/**
 * ActionExecutor - Executes intents with proper sequencing
 *
 * Responsibilities:
 * - Execute intents via plugins
 * - Handle parallel/sequential execution based on execution order
 * - Evaluate conditional intents
 * - Propagate results to dependent intents
 * - Skip dependents when dependencies fail
 * - Report progress via callbacks
 */

import type {
  ParsedIntent,
  ExecutionResult,
  ProgressStatus,
  ProgressCallback,
  Plugin,
} from '../types';

export class ActionExecutor {
  private pluginMap = new Map<string, Plugin>();

  constructor(plugins: Plugin[]) {
    for (const plugin of plugins) {
      for (const action of plugin.actions) {
        this.pluginMap.set(action, plugin);
      }
    }
  }

  /**
   * Execute a single intent.
   */
  async execute(intent: ParsedIntent, priorResults?: Map<string, ExecutionResult>): Promise<ExecutionResult> {
    const plugin = this.pluginMap.get(intent.action);

    if (!plugin) {
      return {
        intentId: intent.id,
        action: intent.action,
        success: false,
        error: `No plugin found for action: ${intent.action}`,
      };
    }

    try {
      // Add prior results to parameters if available
      const params = { ...intent.parameters };
      if (priorResults && priorResults.size > 0) {
        const priorResultsObj: Record<string, ExecutionResult> = {};
        for (const [id, result] of priorResults) {
          priorResultsObj[id] = result;
        }
        params._priorResults = priorResultsObj;
      }

      const result = await plugin.execute(intent.action, params);

      return {
        intentId: intent.id,
        action: intent.action,
        success: result.success,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      return {
        intentId: intent.id,
        action: intent.action,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute all intents according to execution order.
   *
   * @param intents - All intents to execute
   * @param executionOrder - Groups of intent IDs (groups run sequentially, intents within group run in parallel)
   * @param onProgress - Optional callback for progress updates
   */
  async executeAll(
    intents: ParsedIntent[],
    executionOrder: string[][],
    onProgress?: ProgressCallback
  ): Promise<Map<string, ExecutionResult>> {
    const intentMap = new Map(intents.map((i) => [i.id, i]));
    const results = new Map<string, ExecutionResult>();

    for (const group of executionOrder) {
      // Execute group in parallel
      const groupPromises = group.map(async (intentId) => {
        const intent = intentMap.get(intentId);
        if (!intent) {
          const result: ExecutionResult = {
            intentId,
            action: 'unknown',
            success: false,
            error: 'Intent not found',
          };
          results.set(intentId, result);
          return;
        }

        // Check if any dependency failed
        const failedDep = this.findFailedDependency(intent, results);
        if (failedDep) {
          const result: ExecutionResult = {
            intentId: intent.id,
            action: intent.action,
            success: false,
            error: `Skipped: dependency '${failedDep}' failed`,
          };
          results.set(intentId, result);
          onProgress?.(intentId, { type: 'skipped', reason: `dependency '${failedDep}' failed` });
          return;
        }

        // Check conditional
        if (intent.conditional && intent.conditionExpr) {
          const shouldExecute = this.evaluateCondition(intent.conditionExpr, results);
          if (!shouldExecute) {
            const result: ExecutionResult = {
              intentId: intent.id,
              action: intent.action,
              success: false,
              error: 'Skipped: condition not met',
            };
            results.set(intentId, result);
            onProgress?.(intentId, { type: 'skipped', reason: 'condition not met' });
            return;
          }
        }

        // Execute
        onProgress?.(intentId, { type: 'started' });

        const result = await this.execute(intent, results);
        results.set(intentId, result);

        if (result.success) {
          onProgress?.(intentId, { type: 'completed', result: result.data });
        } else {
          onProgress?.(intentId, { type: 'failed', error: result.error || 'Unknown error' });
        }
      });

      await Promise.all(groupPromises);
    }

    return results;
  }

  /**
   * Find first failed dependency.
   */
  private findFailedDependency(
    intent: ParsedIntent,
    results: Map<string, ExecutionResult>
  ): string | null {
    for (const depId of intent.dependencies) {
      const depResult = results.get(depId);
      if (depResult && !depResult.success) {
        return depId;
      }
    }
    return null;
  }

  /**
   * Evaluate a condition expression against prior results.
   *
   * Expression format: "intentId.data.field === value"
   * This is a simple evaluator - in production, use a proper expression parser.
   */
  private evaluateCondition(
    expr: string,
    results: Map<string, ExecutionResult>
  ): boolean {
    try {
      // Build context object from results
      const context: Record<string, ExecutionResult> = {};
      for (const [id, result] of results) {
        context[id] = result;
      }

      // Very simple expression evaluator
      // Format: "intentId.data.field === value"
      const match = expr.match(/^(\w+)\.data\.(\w+)\s*(===|!==|==|!=)\s*(.+)$/);
      if (!match) {
        // Try boolean check: "intentId.data.field"
        const boolMatch = expr.match(/^(\w+)\.data\.(\w+)$/);
        if (boolMatch) {
          const [, intentId, field] = boolMatch;
          const result = context[intentId];
          if (!result || !result.data) return false;
          return Boolean((result.data as Record<string, unknown>)[field]);
        }
        return false;
      }

      const [, intentId, field, operator, rawValue] = match;
      const result = context[intentId];
      if (!result || !result.data) return false;

      const actualValue = (result.data as Record<string, unknown>)[field];
      let expectedValue: unknown = rawValue.trim();

      // Parse expected value
      if (expectedValue === 'true') expectedValue = true;
      else if (expectedValue === 'false') expectedValue = false;
      else if (expectedValue === 'null') expectedValue = null;
      else if (!isNaN(Number(expectedValue))) expectedValue = Number(expectedValue);
      else if (
        (expectedValue as string).startsWith('"') &&
        (expectedValue as string).endsWith('"')
      ) {
        expectedValue = (expectedValue as string).slice(1, -1);
      }

      switch (operator) {
        case '===':
        case '==':
          return actualValue === expectedValue;
        case '!==':
        case '!=':
          return actualValue !== expectedValue;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}
