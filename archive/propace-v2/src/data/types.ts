/**
 * Data Storage Types
 *
 * Type definitions for sensor data storage, time-series queries,
 * and anomaly detection.
 */

/**
 * Sensor types supported by the system
 *
 * These represent monitoring sensors for passive data collection.
 * Interface sensors (microphone, camera, etc.) are handled separately
 * as dedicated plugins that publish events rather than time-series data.
 */
export enum SensorType {
  // Environmental monitoring
  TEMPERATURE = 'temperature',
  HUMIDITY = 'humidity',
  PRESSURE = 'pressure',
  LIGHT = 'light',
  AIR_QUALITY = 'air_quality',

  // Physical monitoring
  DOOR = 'door',
  WINDOW = 'window',
  MOTION = 'motion',
  VIBRATION = 'vibration',
  WATER_LEAK = 'water_leak',
  SMOKE = 'smoke',

  // Generic/extensible
  CUSTOM = 'custom'
}

/**
 * A single sensor reading with timestamp
 */
export interface SensorReading {
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

/**
 * Aggregate function types
 */
export type AggregateFunction = 'avg' | 'min' | 'max' | 'sum' | 'count';

/**
 * Query for aggregate calculations
 */
export interface AggregateQuery {
  sensorId: string;
  function: AggregateFunction;
  after?: Date;
  before?: Date;
}

/**
 * Result of aggregate query
 */
export interface AggregateResult {
  value: number | null;
  count: number;
  sensorId: string;
  function: AggregateFunction;
  timeRange?: {
    after?: Date;
    before?: Date;
  };
}

/**
 * Statistics about stored sensor data
 */
export interface DataStatistics {
  totalReadings: number;
  bySensor: Record<string, number>;
  byType: Record<SensorType, number>;
  oldestReading?: Date;
  newestReading?: Date;
}

/**
 * Anomaly detection result
 *
 * NOTE: Anomaly detection is performed by individual sensor/monitoring plugins,
 * not centrally by DataPipeline. These types are here for reference by plugins.
 */
export interface Anomaly {
  sensorId: string;
  sensorType: SensorType;
  reading: SensorReading;
  anomalyType: AnomalyType;
  severity: number; // 0-1 scale
  baseline: {
    mean?: number;
    stdDev?: number;
    min?: number;
    max?: number;
  };
  deviation: number; // How far from normal
  confidence: number; // 0-1 scale
  timestamp: Date;
}

/**
 * Types of anomalies that can be detected by sensor plugins
 */
export enum AnomalyType {
  SPIKE = 'spike',           // Sudden sharp increase
  DROP = 'drop',             // Sudden sharp decrease
  OUT_OF_RANGE = 'out_of_range', // Value outside expected range
  FLATLINE = 'flatline',     // No variation (stuck sensor)
  PATTERN_BREAK = 'pattern_break' // Breaks expected temporal pattern
}

/**
 * Configuration for anomaly detection (used by sensor plugins)
 */
export interface AnomalyConfig {
  sensorId: string;
  enabled: boolean;
  thresholds: {
    spikeStdDev?: number;     // How many std devs = spike (default: 3)
    dropStdDev?: number;      // How many std devs = drop (default: 3)
    minValue?: number;        // Hard min threshold
    maxValue?: number;        // Hard max threshold
    flatlineWindow?: number;  // Minutes of no change = flatline
    patternConfidence?: number; // Min confidence for pattern (default: 0.7)
  };
  baselineWindow: number;     // Minutes of history for baseline (default: 60)
  checkInterval: number;      // Minutes between checks (default: 5)
}

/**
 * Trend analysis result
 */
export interface Trend {
  sensorId: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  slope: number;             // Rate of change per hour
  confidence: number;        // 0-1 scale
  timeWindow: {
    start: Date;
    end: Date;
  };
  dataPoints: number;
}

/**
 * Data ingestion batch
 */
export interface DataBatch {
  readings: SensorReading[];
  source: string;
  receivedAt: Date;
  processed?: boolean;
}

/**
 * Result of batch processing
 */
export interface BatchProcessResult {
  processed: boolean;
  successCount: number;
  errorCount: number;
  errors?: Array<{ index: number; error: Error }>;
  duration: number; // Processing time in ms
}

/**
 * Pipeline statistics
 */
export interface PipelineStatistics {
  totalIngested: number;
  batchesProcessed: number;
  lastIngestion?: Date;
  averageBatchSize?: number;
}
