/**
 * Data Retention Service
 *
 * Manages automatic cleanup of old data based on retention policies.
 * Prevents database bloat and ensures compliance with data retention requirements.
 */

import { DataStorage } from './dataStorage';
import { EventStore } from '../events/eventStore';
import { Logger } from '../utils/productionLogger';

/**
 * Data retention configuration
 */
export interface DataRetentionConfig {
  enabled: boolean;
  sensorDataDays: number;
  eventLogDays: number;
  decisionHistoryDays: number;
  cleanupIntervalHours?: number; // How often to run cleanup (default: 24)
}

/**
 * Retention statistics
 */
export interface RetentionStats {
  lastCleanup?: Date;
  sensorDataDeleted: number;
  eventLogsDeleted: number;
  decisionHistoryDeleted: number;
  nextScheduledCleanup?: Date;
}

/**
 * Data Retention Service
 */
export class DataRetentionService {
  private config: DataRetentionConfig;
  private dataStorage?: DataStorage;
  private eventStore?: EventStore;
  private cleanupInterval?: NodeJS.Timeout;
  private stats: RetentionStats;
  private logger = Logger.component('DataRetention');

  constructor(config: DataRetentionConfig) {
    this.config = config;
    this.stats = {
      sensorDataDeleted: 0,
      eventLogsDeleted: 0,
      decisionHistoryDeleted: 0
    };
  }

  /**
   * Initialize with storage references
   */
  initialize(dataStorage: DataStorage, eventStore: EventStore): void {
    this.dataStorage = dataStorage;
    this.eventStore = eventStore;

    this.logger.info('Data retention service initialized', {
      enabled: this.config.enabled,
      sensorDataDays: this.config.sensorDataDays,
      eventLogDays: this.config.eventLogDays,
      decisionHistoryDays: this.config.decisionHistoryDays
    });
  }

  /**
   * Start automatic cleanup
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Data retention disabled in configuration');
      return;
    }

    if (!this.dataStorage || !this.eventStore) {
      throw new Error('Data retention service not initialized');
    }

    // Run initial cleanup
    this.runCleanup().catch(error => {
      this.logger.error('Initial cleanup failed', error);
    });

    // Schedule periodic cleanup
    const intervalMs = (this.config.cleanupIntervalHours || 24) * 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch(error => {
        this.logger.error('Scheduled cleanup failed', error);
      });
    }, intervalMs);

    const nextCleanup = new Date(Date.now() + intervalMs);
    this.stats.nextScheduledCleanup = nextCleanup;

    this.logger.info('Data retention cleanup scheduled', {
      intervalHours: this.config.cleanupIntervalHours || 24,
      nextCleanup: nextCleanup.toISOString()
    });
  }

  /**
   * Stop automatic cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      this.logger.info('Data retention cleanup stopped');
    }
  }

  /**
   * Run cleanup now
   */
  async runCleanup(): Promise<RetentionStats> {
    if (!this.dataStorage || !this.eventStore) {
      throw new Error('Data retention service not initialized');
    }

    this.logger.info('Starting data retention cleanup');

    const startTime = Date.now();
    const deletedCounts = {
      sensorData: 0,
      eventLogs: 0,
      decisionHistory: 0
    };

    try {
      // Clean up sensor data
      if (this.config.sensorDataDays > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.sensorDataDays);
        deletedCounts.sensorData = await this.cleanupSensorData(cutoffDate);
      }

      // Clean up event logs
      if (this.config.eventLogDays > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.eventLogDays);
        deletedCounts.eventLogs = await this.cleanupEventLogs(cutoffDate);
      }

      // Clean up decision history
      // Note: This would require access to DecisionEngine storage
      // For now, we'll just log that it's not implemented
      if (this.config.decisionHistoryDays > 0) {
        this.logger.info('Decision history cleanup not yet implemented');
      }

      // Update statistics
      this.stats.lastCleanup = new Date();
      this.stats.sensorDataDeleted += deletedCounts.sensorData;
      this.stats.eventLogsDeleted += deletedCounts.eventLogs;
      this.stats.decisionHistoryDeleted += deletedCounts.decisionHistory;

      const duration = Date.now() - startTime;

      this.logger.info('Data retention cleanup complete', {
        duration,
        sensorDataDeleted: deletedCounts.sensorData,
        eventLogsDeleted: deletedCounts.eventLogs,
        decisionHistoryDeleted: deletedCounts.decisionHistory
      });

      Logger.perf('DataRetentionCleanup', duration, deletedCounts);

      return { ...this.stats };

    } catch (error) {
      this.logger.error('Data retention cleanup failed', error as Error);
      throw error;
    }
  }

  /**
   * Clean up old sensor data
   */
  private async cleanupSensorData(cutoffDate: Date): Promise<number> {
    if (!this.dataStorage) {
      return 0;
    }

    try {
      // Get database connection
      const db = (this.dataStorage as any).db;

      if (!db) {
        this.logger.warn('DataStorage database not available for cleanup');
        return 0;
      }

      // Delete old sensor readings
      const result = db.prepare(
        'DELETE FROM sensor_readings WHERE timestamp < ?'
      ).run(cutoffDate.toISOString());

      const deletedCount = result.changes || 0;

      if (deletedCount > 0) {
        this.logger.info('Deleted old sensor data', {
          count: deletedCount,
          cutoffDate: cutoffDate.toISOString()
        });
      }

      // Vacuum database to reclaim space
      db.exec('VACUUM');

      return deletedCount;

    } catch (error) {
      this.logger.error('Failed to cleanup sensor data', error as Error);
      return 0;
    }
  }

  /**
   * Clean up old event logs
   */
  private async cleanupEventLogs(cutoffDate: Date): Promise<number> {
    if (!this.eventStore) {
      return 0;
    }

    try {
      // Get database connection
      const db = (this.eventStore as any).db;

      if (!db) {
        this.logger.warn('EventStore database not available for cleanup');
        return 0;
      }

      // Delete old events
      const result = db.prepare(
        'DELETE FROM events WHERE timestamp < ?'
      ).run(cutoffDate.toISOString());

      const deletedCount = result.changes || 0;

      if (deletedCount > 0) {
        this.logger.info('Deleted old event logs', {
          count: deletedCount,
          cutoffDate: cutoffDate.toISOString()
        });
      }

      // Vacuum database to reclaim space
      db.exec('VACUUM');

      return deletedCount;

    } catch (error) {
      this.logger.error('Failed to cleanup event logs', error as Error);
      return 0;
    }
  }

  /**
   * Get retention statistics
   */
  getStats(): RetentionStats {
    return { ...this.stats };
  }

  /**
   * Get current retention configuration
   */
  getConfig(): DataRetentionConfig {
    return { ...this.config };
  }

  /**
   * Update retention configuration (requires restart)
   */
  updateConfig(config: Partial<DataRetentionConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    this.logger.info('Data retention configuration updated', config);

    // If running, restart with new config
    if (this.cleanupInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Force immediate cleanup
   */
  async forceCleanup(): Promise<RetentionStats> {
    this.logger.info('Forcing immediate data retention cleanup');
    return this.runCleanup();
  }
}
