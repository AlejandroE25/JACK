/**
 * IntentParser - Parses natural language input into structured intents
 *
 * Design:
 * - Claude (Haiku) handles NLP: text → structured intents
 * - Hardcoded rules handle behavior decisions (acknowledgment, etc.)
 * - Context provided for follow-up resolution
 *
 * The split is intentional:
 * - NLP requires AI (can't hardcode language understanding)
 * - Behavior rules don't require AI (faster, testable, predictable)
 */

import {
  type ParsedIntent,
  type IntentParseResult,
  FAST_ACTIONS,
} from '../types';

// Context from previous conversation turns
export interface ConversationContext {
  recentIntents?: Array<{
    intent: ParsedIntent;
    result: unknown;
    timestamp: number;
  }>;
}

// Interface for Claude client (allows mocking in tests)
export interface ClaudeClient {
  parseIntent(
    input: string,
    context?: ConversationContext
  ): Promise<Omit<IntentParseResult, 'requiresAcknowledgment'>>;
}

export class IntentParser {
  constructor(private claude: ClaudeClient) {}

  /**
   * Parse user input into structured intents.
   *
   * @param input - Raw user text/voice input
   * @param context - Optional conversation context for follow-ups
   * @returns Parsed intents with execution order and acknowledgment decision
   */
  async parseInput(
    input: string,
    context?: ConversationContext
  ): Promise<IntentParseResult> {
    // Call Claude for NLP (text → intents)
    const parsed = await this.claude.parseIntent(input, context);

    // Apply hardcoded acknowledgment logic
    const requiresAcknowledgment = this.shouldAcknowledge(parsed);

    return {
      ...parsed,
      requiresAcknowledgment,
    };
  }

  /**
   * Determine if we should acknowledge before executing.
   *
   * Hardcoded rules (no AI needed):
   * - Multiple intents → acknowledge (complex, will take time)
   * - Single fast action → no acknowledgment (result comes quickly)
   * - Single slow action → acknowledge (user should know we're working)
   *
   * Fast actions are defined in FAST_ACTIONS constant.
   */
  private shouldAcknowledge(
    parsed: Omit<IntentParseResult, 'requiresAcknowledgment'>
  ): boolean {
    // If clarification needed, no acknowledgment (we'll ask the question instead)
    if (parsed.clarificationNeeded) {
      return false;
    }

    // No intents = nothing to acknowledge
    if (parsed.intents.length === 0) {
      return false;
    }

    // Multiple intents = always acknowledge
    if (parsed.intents.length > 1) {
      return true;
    }

    // Single intent: check if it's a fast action
    const action = parsed.intents[0].action;
    const isFastAction = (FAST_ACTIONS as readonly string[]).includes(action);

    return !isFastAction;
  }
}
