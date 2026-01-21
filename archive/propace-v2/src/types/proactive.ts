/**
 * Proactive Intelligence Type Definitions
 *
 * Types for context-aware suggestions, pattern recognition,
 * and proactive assistance capabilities.
 */

export enum SuggestionType {
  /** Suggest an action based on current context */
  ACTION = 'action',

  /** Suggest information that might be relevant */
  INFORMATION = 'information',

  /** Suggest a reminder based on goals/constraints */
  REMINDER = 'reminder',

  /** Suggest a pattern-based insight */
  INSIGHT = 'insight',

  /** Suggest a follow-up question */
  FOLLOWUP = 'followup'
}

export enum SuggestionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface ProactiveSuggestion {
  /** Unique suggestion ID */
  id: string;

  /** Type of suggestion */
  type: SuggestionType;

  /** Priority level */
  priority: SuggestionPriority;

  /** The suggestion content */
  content: string;

  /** Why this suggestion is being made */
  reasoning: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Context that triggered this suggestion */
  triggerContext?: {
    /** Recent messages that led to this */
    recentMessages?: string[];

    /** Extracted contexts that are relevant */
    relevantContexts?: string[];

    /** Detected patterns */
    patterns?: string[];
  };

  /** When suggestion was created */
  timestamp: Date;

  /** When suggestion expires (if time-sensitive) */
  expiresAt?: Date;

  /** Whether user has seen this */
  seen: boolean;

  /** Whether user accepted/rejected */
  userAction?: 'accepted' | 'rejected' | 'ignored';

  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface ConversationPattern {
  /** Pattern ID */
  id: string;

  /** Pattern type */
  type: 'topic_sequence' | 'time_based' | 'context_triggered' | 'user_preference';

  /** Pattern description */
  description: string;

  /** How many times this pattern has occurred */
  frequency: number;

  /** Confidence in this pattern (0-1) */
  confidence: number;

  /** Last time pattern was observed */
  lastSeen: Date;

  /** Pattern data (varies by type) */
  data: {
    /** Topic/subsystem sequence */
    sequence?: string[];

    /** Time of day pattern */
    timePattern?: {
      hour: number;
      dayOfWeek?: number;
    };

    /** Triggering contexts */
    triggerContexts?: string[];

    /** User preferences involved */
    preferences?: Record<string, any>;
  };

  /** What to predict/suggest when pattern is detected */
  prediction?: {
    /** Likely next subsystem */
    nextSubsystem?: string;

    /** Suggested action */
    suggestedAction?: string;

    /** Relevant information */
    relevantInfo?: string[];
  };
}

export interface UserInteractionFeedback {
  /** Feedback ID */
  id: string;

  /** What was the user's query */
  query: string;

  /** What subsystem was routed to */
  subsystem: string;

  /** Was routing correct? */
  routingCorrect: boolean;

  /** Response that was given */
  response: string;

  /** Was response helpful? (implicit or explicit feedback) */
  responseHelpful?: boolean;

  /** Response time in ms */
  responseTime: number;

  /** Whether user asked follow-up */
  hadFollowUp: boolean;

  /** User's explicit rating (1-5) if provided */
  userRating?: number;

  /** Timestamp */
  timestamp: Date;

  /** Additional context */
  metadata?: Record<string, any>;
}

export interface LearningMetrics {
  /** Total interactions tracked */
  totalInteractions: number;

  /** Routing accuracy (0-1) */
  routingAccuracy: number;

  /** Average response helpfulness (0-1) */
  averageHelpfulness: number;

  /** Patterns detected */
  patternsDetected: number;

  /** Suggestions made */
  suggestionsMade: number;

  /** Suggestions accepted */
  suggestionsAccepted: number;

  /** Suggestion acceptance rate (0-1) */
  suggestionAcceptanceRate: number;

  /** Average response time (ms) */
  avgResponseTime: number;

  /** Improvement over time */
  improvement: {
    /** Routing accuracy improvement */
    routingAccuracy: number;

    /** Response time improvement */
    responseTime: number;

    /** Helpfulness improvement */
    helpfulness: number;
  };
}

export interface SmartReminder {
  /** Reminder ID */
  id: string;

  /** What to remind about */
  content: string;

  /** Associated goal or constraint */
  relatedContext: {
    type: 'goal' | 'constraint' | 'preference';
    key: string;
    value: string;
  };

  /** When to trigger */
  trigger: {
    /** Trigger type */
    type: 'time' | 'context' | 'pattern';

    /** Specific trigger condition */
    condition: {
      /** Time-based: timestamp */
      timestamp?: Date;

      /** Context-based: what context must be present */
      requiredContext?: string[];

      /** Pattern-based: what pattern triggers it */
      pattern?: string;
    };
  };

  /** Priority */
  priority: SuggestionPriority;

  /** Whether reminder has been shown */
  shown: boolean;

  /** Created timestamp */
  createdAt: Date;

  /** Last shown timestamp */
  lastShownAt?: Date;

  /** User response to reminder */
  userResponse?: 'acknowledged' | 'snoozed' | 'dismissed';
}

export interface ProactiveConfig {
  /** Enable proactive suggestions */
  enableSuggestions: boolean;

  /** Minimum confidence for suggestions (0-1) */
  suggestionConfidenceThreshold: number;

  /** Enable pattern recognition */
  enablePatternRecognition: boolean;

  /** Minimum pattern frequency to consider */
  minPatternFrequency: number;

  /** Enable smart reminders */
  enableReminders: boolean;

  /** Enable learning and optimization */
  enableLearning: boolean;

  /** How often to analyze patterns (ms) */
  patternAnalysisInterval: number;

  /** How long to keep interaction history (ms) */
  interactionHistoryRetention: number;
}
