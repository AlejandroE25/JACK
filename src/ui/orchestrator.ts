/**
 * Orchestrator - Routes requests and manages the overall flow
 *
 * Responsibilities:
 * 1. Receive user input
 * 2. Parse intents (via IntentParser)
 * 3. Send acknowledgment if needed
 * 4. Execute intents (via ActionExecutor)
 * 5. Decide modality (via ModalityEngine)
 * 6. Send results to client
 * 7. Handle interruptions
 *
 * This is the main coordination point for all user interactions.
 */

import type {
  UserInput,
  ParsedIntent,
  IntentParseResult,
  ExecutionResult,
  ModalityDecision,
  TaskStatus,
  ContentType,
} from '../types';
import type { IntentParser } from './intentParser';
import type { ModalityEngine } from './modalityEngine';

// Callbacks for sending messages to client
export interface OrchestratorCallbacks {
  onAck: (text: string) => void;
  onSpeech: (text: string) => void;
  onDocument: (path: string, type: string) => void;
  onClarify: (question: string, options?: string[]) => void;
  onError: (code: string, message: string) => void;
}

// Action executor interface (implemented in capability layer)
export interface ActionExecutor {
  execute(intent: ParsedIntent): Promise<ExecutionResult>;
}

export class Orchestrator {
  private tasks = new Map<string, TaskStatus>();
  private interruptedClients = new Set<string>();

  constructor(
    private parser: IntentParser,
    private modalityEngine: ModalityEngine,
    private executor: ActionExecutor
  ) {}

  /**
   * Handle user input from start to finish.
   */
  async handle(input: UserInput, callbacks: OrchestratorCallbacks): Promise<void> {
    const { clientId, text } = input;

    // Create task tracking
    const taskId = crypto.randomUUID();
    const task: TaskStatus = {
      taskId,
      state: 'pending',
      intents: [],
      results: [],
      startedAt: Date.now(),
    };
    this.tasks.set(clientId, task);

    try {
      // 1. Parse intents
      const parseResult = await this.parser.parseInput(text);

      // 2. Handle clarification if needed
      if (parseResult.clarificationNeeded) {
        callbacks.onClarify(
          parseResult.clarificationNeeded.question,
          parseResult.clarificationNeeded.options
        );
        task.state = 'completed';
        task.completedAt = Date.now();
        return;
      }

      // 3. No intents = nothing to do
      if (parseResult.intents.length === 0) {
        callbacks.onClarify('What would you like me to do?');
        task.state = 'completed';
        task.completedAt = Date.now();
        return;
      }

      task.intents = parseResult.intents;
      task.state = 'running';

      // 4. Send acknowledgment if needed
      if (parseResult.requiresAcknowledgment) {
        callbacks.onAck('On it.');
      }

      // 5. Execute intents according to execution order
      const results = await this.executeIntents(
        clientId,
        parseResult.intents,
        parseResult.executionOrder
      );
      task.results = results;

      // Check if interrupted
      if (this.interruptedClients.has(clientId)) {
        task.state = 'interrupted';
        task.completedAt = Date.now();
        this.interruptedClients.delete(clientId);
        return;
      }

      // 6. Process results
      for (const result of results) {
        if (!result.success) {
          callbacks.onError('EXECUTION_FAILED', result.error || 'Unknown error');
          task.state = 'failed';
          task.completedAt = Date.now();
          return;
        }

        // Determine content type based on action
        const contentType = this.inferContentType(result);

        // Get modality decision
        const decision = this.modalityEngine.decide(result, contentType);

        // Send responses based on modality
        if (decision.document && decision.documentLocation && decision.documentType) {
          callbacks.onDocument(decision.documentLocation, decision.documentType);
        }

        if (decision.voice) {
          const speechText = decision.highlights || this.formatResult(result);
          callbacks.onSpeech(speechText);
        }
      }

      task.state = 'completed';
      task.completedAt = Date.now();

    } catch (error) {
      task.state = 'failed';
      task.completedAt = Date.now();
      callbacks.onError(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Execute intents according to execution order.
   * Groups in executionOrder run sequentially, intents within a group run in parallel.
   */
  private async executeIntents(
    clientId: string,
    intents: ParsedIntent[],
    executionOrder: string[][]
  ): Promise<ExecutionResult[]> {
    const intentMap = new Map(intents.map((i) => [i.id, i]));
    const results: ExecutionResult[] = [];

    for (const group of executionOrder) {
      // Check for interruption before each group
      if (this.interruptedClients.has(clientId)) {
        break;
      }

      // Execute group in parallel
      const groupPromises = group.map(async (intentId) => {
        const intent = intentMap.get(intentId);
        if (!intent) {
          return {
            intentId,
            action: 'unknown',
            success: false,
            error: 'Intent not found',
          };
        }
        return this.executor.execute(intent);
      });

      const groupResults = await Promise.all(groupPromises);
      results.push(...groupResults);
    }

    return results;
  }

  /**
   * Infer content type from execution result.
   */
  private inferContentType(result: ExecutionResult): ContentType {
    if (!result.success) {
      return 'error';
    }

    const action = result.action;

    // Simple answers
    if (['get_time', 'get_date', 'get_weather', 'simple_math'].includes(action)) {
      return 'simple_answer';
    }

    // Code generation
    if (['generate_code', 'write_code'].includes(action)) {
      return 'code';
    }

    // Data exports
    if (['export_data', 'generate_logs', 'export_csv'].includes(action)) {
      return 'data';
    }

    // Complex results (research, analysis, etc.)
    return 'complex_result';
  }

  /**
   * Format result for speech output.
   */
  private formatResult(result: ExecutionResult): string {
    const data = result.data as Record<string, unknown> | undefined;

    if (!data) {
      return 'Done.';
    }

    // Try common result patterns
    if (typeof data.time === 'string') {
      return data.time;
    }

    if (typeof data.temp === 'number' && typeof data.conditions === 'string') {
      return `${data.temp} degrees and ${data.conditions}`;
    }

    if (typeof data.result === 'string' || typeof data.result === 'number') {
      return String(data.result);
    }

    return 'Done.';
  }

  /**
   * Interrupt the current task for a client.
   */
  interrupt(clientId: string): void {
    this.interruptedClients.add(clientId);
  }

  /**
   * Get the status of the current/last task for a client.
   */
  getTaskStatus(clientId: string): TaskStatus | null {
    return this.tasks.get(clientId) || null;
  }
}
