/**
 * Data Pipeline Service
 *
 * Handles data ingestion, batch processing, trend analysis, and sensor hub integration.
 * Publishes events for all ingested data and detected trends.
 *
 * NOTE: Anomaly detection is NOT performed here - it's handled by individual
 * sensor/monitoring plugins at the edge.
 */

import { EventBus } from '../events/eventBus.js';
import { EventType, EventPriority } from '../events/types.js';
import { DataStorage } from './dataStorage.js';
import {
  SensorReading,
  SensorType,
  DataBatch,
  BatchProcessResult,
  Trend,
  PipelineStatistics,
  AggregateQuery
} from './types.js';

export class DataPipeline {
  private eventBus: EventBus;
  private storage: DataStorage;
  private stats: {
    totalIngested: number;
    batchesProcessed: number;
    lastIngestion?: Date;
    totalBatchSize: number;
  };

  constructor(storage: DataStorage, eventBus: EventBus) {
    this.storage = storage;
    this.eventBus = eventBus;
    this.stats = {
      totalIngested: 0,
      batchesProcessed: 0,
      totalBatchSize: 0
    };
  }

  /**
   * Ingest a single sensor reading
   */
  async ingest(reading: SensorReading): Promise<void> {
    // Validate reading data
    this.validateReading(reading);

    // Auto-set timestamp if not provided
    if (!reading.timestamp) {
      reading.timestamp = new Date();
    }

    // Store in database
    this.storage.store(reading);

    // Update statistics
    this.stats.totalIngested++;
    this.stats.lastIngestion = new Date();

    // Publish event for this reading
    await this.eventBus.publish({
      type: EventType.SENSOR_TRIGGER,
      priority: this.getPriorityForReading(reading),
      source: `sensor:${reading.sensorId}`,
      payload: {
        sensorId: reading.sensorId,
        sensorType: reading.sensorType,
        value: reading.value,
        unit: reading.unit,
        timestamp: reading.timestamp
      },
      metadata: reading.metadata
    });

    // Check if this reading has an anomaly flag from hub/sensor
    if (reading.metadata?.anomaly) {
      await this.eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        priority: EventPriority.HIGH,
        source: `sensor:${reading.sensorId}`,
        payload: {
          sensorId: reading.sensorId,
          sensorType: reading.sensorType,
          value: reading.value,
          unit: reading.unit,
          anomalyType: reading.metadata.anomalyType || 'unknown',
          severity: reading.metadata.severity || 0.5,
          hubDetected: reading.metadata.hubDetected || false
        },
        metadata: reading.metadata
      });
    }
  }

  /**
   * Validate sensor reading data
   */
  private validateReading(reading: SensorReading): void {
    if (!reading.sensorId) {
      throw new Error('Validation failed: sensorId is required');
    }
    if (!reading.sensorType) {
      throw new Error('Validation failed: sensorType is required');
    }
    if (typeof reading.value !== 'number') {
      throw new Error('Validation failed: value must be a number');
    }
    if (!reading.unit) {
      throw new Error('Validation failed: unit is required');
    }
  }

  /**
   * Ingest a batch of sensor readings
   */
  async ingestBatch(batch: DataBatch): Promise<BatchProcessResult> {
    const startTime = Date.now();
    let successCount = 0;
    const errors: Array<{ index: number; error: Error }> = [];

    try {
      // Process each reading
      for (let i = 0; i < batch.readings.length; i++) {
        try {
          await this.ingestFromBatch(batch.readings[i], batch.source);
          successCount++;
        } catch (error) {
          errors.push({
            index: i,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }

      // Update batch statistics
      this.stats.batchesProcessed++;
      this.stats.totalBatchSize += batch.readings.length;

      const duration = Date.now() - startTime;

      return {
        processed: true,
        successCount,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        processed: false,
        successCount,
        errorCount: batch.readings.length - successCount,
        errors: errors.length > 0 ? errors : undefined,
        duration
      };
    }
  }

  /**
   * Ingest a single reading from a batch (preserves batch source for hub integration)
   */
  private async ingestFromBatch(reading: SensorReading, batchSource: string): Promise<void> {
    // Validate reading data
    this.validateReading(reading);

    // Auto-set timestamp if not provided
    if (!reading.timestamp) {
      reading.timestamp = new Date();
    }

    // Store in database
    this.storage.store(reading);

    // Update statistics
    this.stats.totalIngested++;
    this.stats.lastIngestion = new Date();

    // Publish event for this reading
    await this.eventBus.publish({
      type: EventType.SENSOR_TRIGGER,
      priority: this.getPriorityForReading(reading),
      source: `sensor:${reading.sensorId}`,
      payload: {
        sensorId: reading.sensorId,
        sensorType: reading.sensorType,
        value: reading.value,
        unit: reading.unit,
        timestamp: reading.timestamp
      },
      metadata: reading.metadata
    });

    // Check if this reading has an anomaly flag from hub/sensor
    if (reading.metadata?.anomaly) {
      await this.eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        priority: EventPriority.HIGH,
        source: batchSource,
        payload: {
          reading: {
            sensorId: reading.sensorId,
            sensorType: reading.sensorType,
            value: reading.value,
            unit: reading.unit,
            timestamp: reading.timestamp,
            metadata: reading.metadata
          }
        }
      });
    }
  }

  /**
   * Analyze trend for a sensor
   */
  async analyzeTrend(
    sensorId: string,
    windowMinutes: number = 60
  ): Promise<Trend | null> {
    const now = new Date();
    const startTime = new Date(now.getTime() - windowMinutes * 60 * 1000);

    // Get readings in time window
    const readings = this.storage.getInRange(sensorId, startTime, now);

    if (readings.length < 2) {
      throw new Error('Insufficient data for trend analysis');
    }

    // Calculate linear regression
    const points = readings.map(r => ({
      x: r.timestamp!.getTime(),
      y: r.value
    }));

    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

    // Slope (rate of change)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Convert to per-hour rate
    const slopePerHour = slope * (1000 * 60 * 60);

    // Calculate R² for confidence
    const meanY = sumY / n;
    const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
    const ssResidual = points.reduce((sum, p) => {
      const predicted = slope * p.x + (sumY - slope * sumX) / n;
      return sum + Math.pow(p.y - predicted, 2);
    }, 0);
    const rSquared = 1 - ssResidual / ssTotal;
    const confidence = Math.max(0, Math.min(1, rSquared));

    // Determine direction
    let direction: 'increasing' | 'decreasing' | 'stable';
    const threshold = 0.1; // Threshold for "stable" (per hour)

    if (Math.abs(slopePerHour) < threshold) {
      direction = 'stable';
    } else if (slopePerHour > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return {
      sensorId,
      direction,
      slope: slopePerHour,
      confidence,
      timeWindow: {
        start: startTime,
        end: now
      },
      dataPoints: readings.length
    };
  }

  /**
   * Get latest readings for a sensor
   */
  getLatest(sensorId: string, limit: number = 10): SensorReading[] {
    return this.storage.getLatest(sensorId, limit);
  }

  /**
   * Get recent readings for a sensor (alias for getLatest for tests)
   */
  async getRecentReadings(sensorId: string, limit: number = 10): Promise<SensorReading[]> {
    return this.storage.getLatest(sensorId, limit);
  }

  /**
   * Get readings by time range
   */
  getByTimeRange(sensorId: string, after: Date, before: Date): SensorReading[] {
    return this.storage.getByTimeRange(sensorId, after, before);
  }

  /**
   * Perform aggregate query
   */
  aggregate(query: AggregateQuery) {
    return this.storage.aggregate(query);
  }

  /**
   * Get average value for a sensor over time window
   */
  async getAverage(sensorId: string, windowMinutes: number): Promise<number | null> {
    const after = new Date(Date.now() - windowMinutes * 60 * 1000);
    const result = this.storage.aggregate({
      sensorId,
      function: 'avg',
      after
    });
    return result.value;
  }

  /**
   * Get minimum value for a sensor over time window
   */
  async getMin(sensorId: string, windowMinutes: number): Promise<number | null> {
    const after = new Date(Date.now() - windowMinutes * 60 * 1000);
    const result = this.storage.aggregate({
      sensorId,
      function: 'min',
      after
    });
    return result.value;
  }

  /**
   * Get maximum value for a sensor over time window
   */
  async getMax(sensorId: string, windowMinutes: number): Promise<number | null> {
    const after = new Date(Date.now() - windowMinutes * 60 * 1000);
    const result = this.storage.aggregate({
      sensorId,
      function: 'max',
      after
    });
    return result.value;
  }

  /**
   * Get pipeline statistics
   */
  getStatistics(): PipelineStatistics {
    return {
      totalIngested: this.stats.totalIngested,
      batchesProcessed: this.stats.batchesProcessed,
      lastIngestion: this.stats.lastIngestion,
      averageBatchSize: this.stats.batchesProcessed > 0
        ? this.stats.totalBatchSize / this.stats.batchesProcessed
        : undefined
    };
  }

  /**
   * Shutdown the pipeline (cleanup method for tests)
   */
  async shutdown(): Promise<void> {
    // No background tasks to clean up in current implementation
    // This method exists for test compatibility
  }

  /**
   * Get priority for a reading based on metadata
   */
  private getPriorityForReading(reading: SensorReading): EventPriority {
    // Check if reading has priority in metadata
    if (reading.metadata?.priority) {
      return reading.metadata.priority as EventPriority;
    }

    // Check if it's an anomaly (high priority)
    if (reading.metadata?.anomaly) {
      return EventPriority.HIGH;
    }

    // Default priority based on sensor type
    switch (reading.sensorType) {
      case SensorType.SMOKE:
      case SensorType.WATER_LEAK:
        return EventPriority.URGENT;
      case SensorType.DOOR:
      case SensorType.WINDOW:
      case SensorType.MOTION:
        return EventPriority.HIGH;
      default:
        return EventPriority.MEDIUM;
    }
  }
}
