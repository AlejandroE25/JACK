/**
 * Learning Engine
 *
 * Tracks response quality, routing accuracy, and user interactions
 * to continuously improve Pace's performance over time.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import {
  UserInteractionFeedback,
  LearningMetrics
} from '../types/proactive.js';

export class LearningEngine extends EventEmitter {
  private interactions: UserInteractionFeedback[];
  private maxHistorySize: number;
  private routingCorrections: Map<string, { correct: string; incorrect: string }>;

  constructor(maxHistorySize: number = 1000) {
    super();
    this.interactions = [];
    this.maxHistorySize = maxHistorySize;
    this.routingCorrections = new Map();

    logger.info('Learning engine initialized', { maxHistorySize });
  }

  /**
   * Record a user interaction for learning
   */
  recordInteraction(
    query: string,
    subsystem: string,
    response: string,
    responseTime: number,
    metadata?: Record<string, any>
  ): UserInteractionFeedback {
    const interaction: UserInteractionFeedback = {
      id: randomUUID(),
      query,
      subsystem,
      routingCorrect: true, // Assumed until corrected
      response,
      responseTime,
      hadFollowUp: false, // Will be updated if follow-up occurs
      timestamp: new Date(),
      metadata
    };

    this.interactions.push(interaction);

    // Maintain max history size
    if (this.interactions.length > this.maxHistorySize) {
      this.interactions.shift();
    }

    logger.debug('Interaction recorded', {
      id: interaction.id,
      subsystem,
      responseTime
    });

    this.emit('interaction_recorded', interaction);

    return interaction;
  }

  /**
   * Mark that a follow-up question occurred (indicates user needed more info)
   */
  recordFollowUp(previousInteractionId: string): void {
    const interaction = this.interactions.find(i => i.id === previousInteractionId);

    if (interaction) {
      interaction.hadFollowUp = true;

      logger.debug('Follow-up recorded', { interactionId: previousInteractionId });

      this.emit('followup_recorded', interaction);
    }
  }

  /**
   * Record explicit user feedback on response quality
   */
  recordUserRating(interactionId: string, rating: number): void {
    const interaction = this.interactions.find(i => i.id === interactionId);

    if (!interaction) {
      logger.warn('Interaction not found for rating', { interactionId });
      return;
    }

    interaction.userRating = rating;
    interaction.responseHelpful = rating >= 3; // 3+ out of 5 is helpful

    logger.info('User rating recorded', {
      interactionId,
      rating,
      helpful: interaction.responseHelpful
    });

    this.emit('rating_recorded', { interaction, rating });
  }

  /**
   * Record that routing was incorrect (manual correction)
   */
  recordRoutingCorrection(
    interactionId: string,
    incorrectSubsystem: string,
    correctSubsystem: string
  ): void {
    const interaction = this.interactions.find(i => i.id === interactionId);

    if (interaction) {
      interaction.routingCorrect = false;
      interaction.metadata = {
        ...interaction.metadata,
        correctSubsystem
      };
    }

    // Store for pattern learning
    const key = this.normalizeQuery(interaction?.query || '');
    this.routingCorrections.set(key, {
      incorrect: incorrectSubsystem,
      correct: correctSubsystem
    });

    logger.info('Routing correction recorded', {
      interactionId,
      incorrect: incorrectSubsystem,
      correct: correctSubsystem
    });

    this.emit('routing_corrected', {
      interaction,
      incorrectSubsystem,
      correctSubsystem
    });
  }

  /**
   * Infer response helpfulness from user behavior
   */
  inferResponseQuality(
    interactionId: string,
    userContinued: boolean,
    timeToNextQuery?: number
  ): void {
    const interaction = this.interactions.find(i => i.id === interactionId);

    if (!interaction) {
      return;
    }

    // Heuristics for helpfulness:
    // - If user continued conversation smoothly -> helpful
    // - If user asked immediate follow-up -> maybe not helpful
    // - If long pause before next query -> helpful (user satisfied)
    // - If quick follow-up with similar query -> not helpful (user unsatisfied)

    if (interaction.hadFollowUp) {
      // Already marked as having follow-up
      interaction.responseHelpful = false;
    } else if (userContinued && timeToNextQuery && timeToNextQuery > 30000) {
      // User took time before next query - probably satisfied
      interaction.responseHelpful = true;
    } else if (userContinued && timeToNextQuery && timeToNextQuery < 5000) {
      // Very quick follow-up - might indicate dissatisfaction
      interaction.responseHelpful = false;
    } else {
      // Default: assume helpful
      interaction.responseHelpful = true;
    }

    logger.debug('Response quality inferred', {
      interactionId,
      helpful: interaction.responseHelpful,
      hadFollowUp: interaction.hadFollowUp,
      timeToNextQuery
    });
  }

  /**
   * Get routing suggestion based on learned corrections
   */
  getRoutingSuggestion(query: string): string | null {
    const normalized = this.normalizeQuery(query);
    const correction = this.routingCorrections.get(normalized);

    if (correction) {
      logger.debug('Routing suggestion from learned correction', {
        query,
        suggested: correction.correct
      });

      return correction.correct;
    }

    return null;
  }

  /**
   * Calculate current learning metrics
   */
  getMetrics(): LearningMetrics {
    const total = this.interactions.length;

    if (total === 0) {
      return {
        totalInteractions: 0,
        routingAccuracy: 1.0,
        averageHelpfulness: 0,
        patternsDetected: 0,
        suggestionsMade: 0,
        suggestionsAccepted: 0,
        suggestionAcceptanceRate: 0,
        avgResponseTime: 0,
        improvement: {
          routingAccuracy: 0,
          responseTime: 0,
          helpfulness: 0
        }
      };
    }

    // Routing accuracy
    const routingCorrect = this.interactions.filter(i => i.routingCorrect).length;
    const routingAccuracy = routingCorrect / total;

    // Average helpfulness (only count interactions with known helpfulness)
    const withHelpfulnessData = this.interactions.filter(
      i => i.responseHelpful !== undefined
    );
    const helpfulCount = withHelpfulnessData.filter(i => i.responseHelpful).length;
    const averageHelpfulness = withHelpfulnessData.length > 0
      ? helpfulCount / withHelpfulnessData.length
      : 0;

    // Average response time
    const avgResponseTime = this.interactions.reduce((sum, i) => sum + i.responseTime, 0) / total;

    // Calculate improvement over time (compare first half vs second half)
    const improvement = this.calculateImprovement();

    return {
      totalInteractions: total,
      routingAccuracy,
      averageHelpfulness,
      patternsDetected: 0, // Will be populated by pattern recognition
      suggestionsMade: 0, // Will be populated by suggestion engine
      suggestionsAccepted: 0,
      suggestionAcceptanceRate: 0,
      avgResponseTime,
      improvement
    };
  }

  /**
   * Calculate improvement over time
   */
  private calculateImprovement(): {
    routingAccuracy: number;
    responseTime: number;
    helpfulness: number;
  } {
    const total = this.interactions.length;

    if (total < 20) {
      // Not enough data
      return { routingAccuracy: 0, responseTime: 0, helpfulness: 0 };
    }

    const midpoint = Math.floor(total / 2);
    const firstHalf = this.interactions.slice(0, midpoint);
    const secondHalf = this.interactions.slice(midpoint);

    // Routing accuracy improvement
    const firstHalfRoutingAccuracy = firstHalf.filter(i => i.routingCorrect).length / firstHalf.length;
    const secondHalfRoutingAccuracy = secondHalf.filter(i => i.routingCorrect).length / secondHalf.length;
    const routingAccuracyImprovement = secondHalfRoutingAccuracy - firstHalfRoutingAccuracy;

    // Response time improvement (negative is better)
    const firstHalfAvgTime = firstHalf.reduce((sum, i) => sum + i.responseTime, 0) / firstHalf.length;
    const secondHalfAvgTime = secondHalf.reduce((sum, i) => sum + i.responseTime, 0) / secondHalf.length;
    const responseTimeImprovement = firstHalfAvgTime - secondHalfAvgTime; // Positive means improvement

    // Helpfulness improvement
    const firstHalfHelpful = firstHalf.filter(i => i.responseHelpful !== undefined);
    const secondHalfHelpful = secondHalf.filter(i => i.responseHelpful !== undefined);

    let helpfulnessImprovement = 0;
    if (firstHalfHelpful.length > 0 && secondHalfHelpful.length > 0) {
      const firstHalfHelpRate = firstHalfHelpful.filter(i => i.responseHelpful).length / firstHalfHelpful.length;
      const secondHalfHelpRate = secondHalfHelpful.filter(i => i.responseHelpful).length / secondHalfHelpful.length;
      helpfulnessImprovement = secondHalfHelpRate - firstHalfHelpRate;
    }

    return {
      routingAccuracy: routingAccuracyImprovement,
      responseTime: responseTimeImprovement,
      helpfulness: helpfulnessImprovement
    };
  }

  /**
   * Get recent interactions
   */
  getRecentInteractions(limit: number = 10): UserInteractionFeedback[] {
    return this.interactions.slice(-limit).reverse();
  }

  /**
   * Get interactions by subsystem
   */
  getInteractionsBySubsystem(subsystem: string): UserInteractionFeedback[] {
    return this.interactions.filter(i => i.subsystem === subsystem);
  }

  /**
   * Get routing accuracy for specific subsystem
   */
  getSubsystemAccuracy(subsystem: string): number {
    const subsystemInteractions = this.getInteractionsBySubsystem(subsystem);

    if (subsystemInteractions.length === 0) {
      return 1.0; // No data, assume perfect
    }

    const correct = subsystemInteractions.filter(i => i.routingCorrect).length;
    return correct / subsystemInteractions.length;
  }

  /**
   * Normalize query for comparison
   */
  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }

  /**
   * Export interaction data for analysis
   */
  exportData(): UserInteractionFeedback[] {
    return [...this.interactions];
  }

  /**
   * Clear all learning data
   */
  clear(): void {
    this.interactions = [];
    this.routingCorrections.clear();

    logger.warn('Learning data cleared');

    this.emit('data_cleared');
  }
}
