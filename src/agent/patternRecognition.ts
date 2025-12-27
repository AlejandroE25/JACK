/**
 * Pattern Recognition System
 *
 * Detects and learns from conversation patterns to predict user needs
 * and improve routing decisions.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ConversationPattern } from '../types/proactive.js';

export class PatternRecognition extends EventEmitter {
  private patterns: Map<string, ConversationPattern>;
  private conversationHistory: Array<{
    subsystem: string;
    timestamp: Date;
    context: string[];
  }>;
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 500) {
    super();
    this.patterns = new Map();
    this.conversationHistory = [];
    this.maxHistorySize = maxHistorySize;

    logger.info('Pattern recognition initialized', { maxHistorySize });
  }

  /**
   * Record a conversation turn for pattern analysis
   */
  recordConversation(
    subsystem: string,
    contexts: string[] = []
  ): void {
    this.conversationHistory.push({
      subsystem,
      timestamp: new Date(),
      context: contexts
    });

    // Maintain max history
    if (this.conversationHistory.length > this.maxHistorySize) {
      this.conversationHistory.shift();
    }

    // Analyze for new patterns
    this.analyzeRecentPatterns();
  }

  /**
   * Analyze recent conversation history for patterns
   */
  private analyzeRecentPatterns(): void {
    // Look for subsystem sequences (e.g., weather -> news -> general)
    this.detectSequencePatterns();

    // Look for time-based patterns (e.g., news every morning)
    this.detectTimePatterns();

    // Look for context-triggered patterns
    this.detectContextPatterns();
  }

  /**
   * Detect subsystem sequence patterns
   */
  private detectSequencePatterns(): void {
    const sequenceLength = 3;
    const minOccurrences = 2;

    if (this.conversationHistory.length < sequenceLength) {
      return;
    }

    // Extract recent sequences
    const sequences: string[][] = [];
    for (let i = 0; i <= this.conversationHistory.length - sequenceLength; i++) {
      const sequence = this.conversationHistory
        .slice(i, i + sequenceLength)
        .map(h => h.subsystem);
      sequences.push(sequence);
    }

    // Count sequence occurrences
    const sequenceCounts = new Map<string, number>();
    for (const seq of sequences) {
      const key = seq.join(' -> ');
      sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
    }

    // Create patterns for frequent sequences
    for (const [seqKey, count] of sequenceCounts.entries()) {
      if (count >= minOccurrences) {
        const sequence = seqKey.split(' -> ');
        const patternId = `sequence_${seqKey.replace(/\s+/g, '_')}`;

        const existingPattern = this.patterns.get(patternId);

        if (existingPattern) {
          // Update existing pattern
          existingPattern.frequency = count;
          existingPattern.lastSeen = new Date();
          existingPattern.confidence = Math.min(count / 10, 1.0); // Cap at 1.0
        } else {
          // Create new pattern
          const pattern: ConversationPattern = {
            id: patternId,
            type: 'topic_sequence',
            description: `User often follows sequence: ${seqKey}`,
            frequency: count,
            confidence: Math.min(count / 10, 1.0),
            lastSeen: new Date(),
            data: {
              sequence
            },
            prediction: {
              nextSubsystem: sequence[sequence.length - 1],
              suggestedAction: `Prepare for ${sequence[sequence.length - 1]} subsystem`
            }
          };

          this.patterns.set(patternId, pattern);

          logger.info('New sequence pattern detected', {
            pattern: seqKey,
            frequency: count
          });

          this.emit('pattern_detected', pattern);
        }
      }
    }
  }

  /**
   * Detect time-based patterns (e.g., news every morning)
   */
  private detectTimePatterns(): void {
    const subsystemsByHour = new Map<string, number[]>();

    // Group subsystems by hour of day
    for (const conv of this.conversationHistory) {
      const hour = conv.timestamp.getHours();
      const subsystem = conv.subsystem;

      if (!subsystemsByHour.has(subsystem)) {
        subsystemsByHour.set(subsystem, []);
      }

      subsystemsByHour.get(subsystem)!.push(hour);
    }

    // Detect patterns (e.g., weather queries mostly in morning)
    for (const [subsystem, hours] of subsystemsByHour.entries()) {
      if (hours.length < 3) continue; // Need at least 3 occurrences

      // Calculate most common hour
      const hourCounts = new Map<number, number>();
      for (const hour of hours) {
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }

      const mostCommonHour = Array.from(hourCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];

      if (mostCommonHour && mostCommonHour[1] >= 2) {
        const patternId = `time_${subsystem}_${mostCommonHour[0]}`;
        const frequency = mostCommonHour[1];

        const existingPattern = this.patterns.get(patternId);

        if (existingPattern) {
          existingPattern.frequency = frequency;
          existingPattern.lastSeen = new Date();
          existingPattern.confidence = Math.min(frequency / 5, 1.0);
        } else {
          const pattern: ConversationPattern = {
            id: patternId,
            type: 'time_based',
            description: `User often uses ${subsystem} around ${mostCommonHour[0]}:00`,
            frequency,
            confidence: Math.min(frequency / 5, 1.0),
            lastSeen: new Date(),
            data: {
              timePattern: {
                hour: mostCommonHour[0]
              }
            },
            prediction: {
              nextSubsystem: subsystem,
              suggestedAction: `Suggest ${subsystem} queries around ${mostCommonHour[0]}:00`
            }
          };

          this.patterns.set(patternId, pattern);

          logger.info('New time-based pattern detected', {
            subsystem,
            hour: mostCommonHour[0],
            frequency
          });

          this.emit('pattern_detected', pattern);
        }
      }
    }
  }

  /**
   * Detect context-triggered patterns
   */
  private detectContextPatterns(): void {
    const contextTriggers = new Map<string, string[]>();

    // Look for context -> subsystem associations
    for (const conv of this.conversationHistory) {
      for (const context of conv.context) {
        if (!contextTriggers.has(context)) {
          contextTriggers.set(context, []);
        }
        contextTriggers.get(context)!.push(conv.subsystem);
      }
    }

    // Detect strong context -> subsystem correlations
    for (const [context, subsystems] of contextTriggers.entries()) {
      if (subsystems.length < 2) continue;

      // Count subsystem occurrences for this context
      const subsystemCounts = new Map<string, number>();
      for (const subsystem of subsystems) {
        subsystemCounts.set(subsystem, (subsystemCounts.get(subsystem) || 0) + 1);
      }

      // Find dominant subsystem
      const dominant = Array.from(subsystemCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];

      if (dominant && dominant[1] >= 2) {
        const patternId = `context_${context}_${dominant[0]}`;
        const frequency = dominant[1];

        const existingPattern = this.patterns.get(patternId);

        if (existingPattern) {
          existingPattern.frequency = frequency;
          existingPattern.lastSeen = new Date();
          existingPattern.confidence = Math.min(frequency / 5, 1.0);
        } else {
          const pattern: ConversationPattern = {
            id: patternId,
            type: 'context_triggered',
            description: `When ${context} is present, user often uses ${dominant[0]}`,
            frequency,
            confidence: Math.min(frequency / 5, 1.0),
            lastSeen: new Date(),
            data: {
              triggerContexts: [context]
            },
            prediction: {
              nextSubsystem: dominant[0],
              relevantInfo: [`Context: ${context}`]
            }
          };

          this.patterns.set(patternId, pattern);

          logger.info('New context pattern detected', {
            context,
            subsystem: dominant[0],
            frequency
          });

          this.emit('pattern_detected', pattern);
        }
      }
    }
  }

  /**
   * Predict next subsystem based on current context
   */
  predictNextSubsystem(
    recentSubsystems: string[],
    currentContexts: string[] = [],
    currentTime: Date = new Date()
  ): { subsystem: string; confidence: number; reasoning: string } | null {
    let bestPrediction: { subsystem: string; confidence: number; reasoning: string } | null = null;

    // Check sequence patterns
    if (recentSubsystems.length >= 2) {
      const recentSequence = recentSubsystems.slice(-2).join(' -> ');

      for (const pattern of this.patterns.values()) {
        if (pattern.type === 'topic_sequence' && pattern.data.sequence) {
          const patternSequence = pattern.data.sequence.slice(0, 2).join(' -> ');

          if (patternSequence === recentSequence && pattern.prediction?.nextSubsystem) {
            if (!bestPrediction || pattern.confidence > bestPrediction.confidence) {
              bestPrediction = {
                subsystem: pattern.prediction.nextSubsystem,
                confidence: pattern.confidence,
                reasoning: `Sequence pattern: ${pattern.description}`
              };
            }
          }
        }
      }
    }

    // Check time-based patterns
    const currentHour = currentTime.getHours();

    for (const pattern of this.patterns.values()) {
      if (pattern.type === 'time_based' &&
          pattern.data.timePattern?.hour === currentHour &&
          pattern.prediction?.nextSubsystem) {
        if (!bestPrediction || pattern.confidence > bestPrediction.confidence) {
          bestPrediction = {
            subsystem: pattern.prediction.nextSubsystem,
            confidence: pattern.confidence * 0.8, // Slightly lower confidence for time-based
            reasoning: `Time-based pattern: ${pattern.description}`
          };
        }
      }
    }

    // Check context-triggered patterns
    for (const context of currentContexts) {
      for (const pattern of this.patterns.values()) {
        if (pattern.type === 'context_triggered' &&
            pattern.data.triggerContexts?.includes(context) &&
            pattern.prediction?.nextSubsystem) {
          if (!bestPrediction || pattern.confidence > bestPrediction.confidence) {
            bestPrediction = {
              subsystem: pattern.prediction.nextSubsystem,
              confidence: pattern.confidence,
              reasoning: `Context pattern: ${pattern.description}`
            };
          }
        }
      }
    }

    if (bestPrediction) {
      logger.debug('Subsystem prediction made', bestPrediction);
    }

    return bestPrediction;
  }

  /**
   * Get all detected patterns
   */
  getPatterns(): ConversationPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: ConversationPattern['type']): ConversationPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.type === type);
  }

  /**
   * Get pattern statistics
   */
  getStatistics(): {
    totalPatterns: number;
    byType: Record<string, number>;
    avgConfidence: number;
    mostFrequent: ConversationPattern | null;
  } {
    const patterns = this.getPatterns();

    const byType: Record<string, number> = {
      topic_sequence: 0,
      time_based: 0,
      context_triggered: 0,
      user_preference: 0
    };

    let totalConfidence = 0;
    let mostFrequent: ConversationPattern | null = null;

    for (const pattern of patterns) {
      byType[pattern.type]++;
      totalConfidence += pattern.confidence;

      if (!mostFrequent || pattern.frequency > mostFrequent.frequency) {
        mostFrequent = pattern;
      }
    }

    return {
      totalPatterns: patterns.length,
      byType,
      avgConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
      mostFrequent
    };
  }

  /**
   * Clear old patterns (low confidence or not seen recently)
   */
  prunePatterns(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const now = new Date();
    let pruned = 0;

    for (const [id, pattern] of this.patterns.entries()) {
      const age = now.getTime() - pattern.lastSeen.getTime();

      if (age > maxAge || pattern.confidence < 0.2) {
        this.patterns.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.info('Pruned old patterns', { count: pruned });
    }

    return pruned;
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.conversationHistory = [];

    logger.warn('All patterns cleared');

    this.emit('patterns_cleared');
  }
}
