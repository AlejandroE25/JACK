/**
 * ModalityEngine - Decides how to present output to the user
 *
 * This is the core UX decision engine. The output modality matches what's actually useful:
 * - Simple answer → Voice only
 * - Complex result → Voice highlights + Document (auto-open)
 * - Code/data → Document only (brief voice announcement)
 * - Error → Voice (for user decision)
 *
 * Document locations:
 * - Research/docs → Desktop
 * - Code → Project folder (or Desktop if no project)
 * - Data exports → Downloads
 * - Logs → ~/.jack/logs/
 */

import type {
  ExecutionResult,
  ModalityDecision,
  ContentType,
} from '../types';
import { homedir } from 'os';
import { join } from 'path';

export interface ModalityContext {
  projectPath?: string;
  isLog?: boolean;
}

export class ModalityEngine {
  private homeDir = homedir();

  /**
   * Decide how to present the result to the user.
   *
   * @param result - The execution result
   * @param contentType - Hint about the content type
   * @param context - Optional context (project path, etc.)
   */
  decide(
    result: ExecutionResult,
    contentType: ContentType,
    context?: ModalityContext
  ): ModalityDecision {
    switch (contentType) {
      case 'simple_answer':
        return this.decideSimpleAnswer(result);

      case 'complex_result':
        return this.decideComplexResult(result);

      case 'code':
        return this.decideCode(result, context);

      case 'data':
        return this.decideData(result, context);

      case 'error':
        return this.decideError(result);

      default:
        // Default to voice only for unknown content types
        return {
          voice: true,
          document: false,
          autoOpen: false,
        };
    }
  }

  /**
   * Simple answer: Voice only, no document
   */
  private decideSimpleAnswer(_result: ExecutionResult): ModalityDecision {
    return {
      voice: true,
      document: false,
      autoOpen: false,
    };
  }

  /**
   * Complex result: Voice highlights + Document (auto-open)
   */
  private decideComplexResult(result: ExecutionResult): ModalityDecision {
    const highlights = this.generateHighlights(result);

    return {
      voice: true,
      document: true,
      documentType: 'markdown',
      documentLocation: join(this.homeDir, 'Desktop'),
      autoOpen: true,
      highlights,
    };
  }

  /**
   * Code: Document + brief voice announcement
   */
  private decideCode(
    _result: ExecutionResult,
    context?: ModalityContext
  ): ModalityDecision {
    const location = context?.projectPath || join(this.homeDir, 'Desktop');

    return {
      voice: true, // Brief announcement of location
      document: true,
      documentType: 'code',
      documentLocation: location,
      autoOpen: true,
      highlights: 'Code generated and saved.',
    };
  }

  /**
   * Data: Document + brief voice announcement
   * Logs go to ~/.jack/logs/ and don't auto-open
   */
  private decideData(
    _result: ExecutionResult,
    context?: ModalityContext
  ): ModalityDecision {
    const isLog = context?.isLog ?? false;
    const location = isLog
      ? join(this.homeDir, '.jack', 'logs')
      : join(this.homeDir, 'Downloads');

    return {
      voice: true,
      document: true,
      documentType: 'data',
      documentLocation: location,
      autoOpen: !isLog, // Logs don't auto-open
      highlights: isLog ? 'Logs saved.' : 'Data exported.',
    };
  }

  /**
   * Error: Voice only (user needs to make a decision)
   */
  private decideError(_result: ExecutionResult): ModalityDecision {
    return {
      voice: true,
      document: false,
      autoOpen: false,
    };
  }

  /**
   * Generate concise highlights for voice summary.
   * Extracts key points from the result data.
   */
  private generateHighlights(result: ExecutionResult): string {
    const data = result.data as Record<string, unknown> | undefined;

    if (!data) {
      return 'Result ready.';
    }

    // Try to extract summary or recommendation
    if (typeof data.summary === 'string') {
      return data.summary;
    }

    if (typeof data.recommendation === 'string') {
      return data.recommendation;
    }

    // Generic fallback
    return 'Full details in the document.';
  }
}
