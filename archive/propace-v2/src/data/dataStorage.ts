/**
 * Data Storage Service
 *
 * SQLite-backed time-series storage for sensor readings with:
 * - Automatic timestamping
 * - Aggregate queries (avg, min, max, sum, count)
 * - Time range filtering
 * - Performance-optimized indexes
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  SensorReading,
  SensorType,
  AggregateQuery,
  AggregateResult,
  AggregateFunction,
  DataStatistics
} from './types.js';

export class DataStorage {
  private db: Database.Database;
  private storeStmt!: Database.Statement;
  private storeBatchStmt!: Database.Statement;
  private getLatestStmt!: Database.Statement;
  private getLatestByTypeStmt!: Database.Statement;
  private getByTimeRangeStmt!: Database.Statement;
  private deleteBySensorStmt!: Database.Statement;
  private deleteByTimeRangeStmt!: Database.Statement;
  private deleteByTypeStmt!: Database.Statement;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initializeSchema();
    this.prepareStatements();
  }

  /**
   * Initialize database schema with performance indexes
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id TEXT PRIMARY KEY,
        sensor_id TEXT NOT NULL,
        sensor_type TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    // Performance indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_id ON sensor_readings(sensor_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_type ON sensor_readings(sensor_type);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time ON sensor_readings(sensor_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_type_time ON sensor_readings(sensor_type, timestamp DESC);
    `);
  }

  /**
   * Prepare frequently used SQL statements for better performance
   */
  private prepareStatements(): void {
    this.storeStmt = this.db.prepare(`
      INSERT INTO sensor_readings (id, sensor_id, sensor_type, value, unit, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.storeBatchStmt = this.db.prepare(`
      INSERT INTO sensor_readings (id, sensor_id, sensor_type, value, unit, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.getLatestStmt = this.db.prepare(`
      SELECT * FROM sensor_readings
      WHERE sensor_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.getLatestByTypeStmt = this.db.prepare(`
      SELECT * FROM sensor_readings
      WHERE sensor_type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.getByTimeRangeStmt = this.db.prepare(`
      SELECT * FROM sensor_readings
      WHERE sensor_id = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp DESC
    `);

    this.deleteBySensorStmt = this.db.prepare(`
      DELETE FROM sensor_readings WHERE sensor_id = ?
    `);

    this.deleteByTimeRangeStmt = this.db.prepare(`
      DELETE FROM sensor_readings
      WHERE timestamp >= ? AND timestamp <= ?
    `);

    this.deleteByTypeStmt = this.db.prepare(`
      DELETE FROM sensor_readings WHERE sensor_type = ?
    `);
  }

  /**
   * Store a single sensor reading
   */
  store(reading: SensorReading): boolean {
    const id = randomUUID();
    const timestamp = reading.timestamp ? reading.timestamp.getTime() : Date.now();
    const metadata = reading.metadata ? JSON.stringify(reading.metadata) : null;

    this.storeStmt.run(
      id,
      reading.sensorId,
      reading.sensorType,
      reading.value,
      reading.unit,
      timestamp,
      metadata
    );

    return true;
  }

  /**
   * Store multiple sensor readings in a transaction
   */
  storeBatch(readings: SensorReading[]): void {
    const transaction = this.db.transaction((batch: SensorReading[]) => {
      for (const reading of batch) {
        const id = randomUUID();
        const timestamp = reading.timestamp ? reading.timestamp.getTime() : Date.now();
        const metadata = reading.metadata ? JSON.stringify(reading.metadata) : null;

        this.storeBatchStmt.run(
          id,
          reading.sensorId,
          reading.sensorType,
          reading.value,
          reading.unit,
          timestamp,
          metadata
        );
      }
    });

    transaction(readings);
  }

  /**
   * Get latest readings for a sensor
   */
  getLatest(sensorId: string, limit: number = 10): SensorReading[] {
    const rows = this.getLatestStmt.all(sensorId, limit) as any[];
    return rows.map(this.rowToReading);
  }

  /**
   * Get latest readings by sensor type
   */
  getLatestByType(sensorType: SensorType, limit: number = 10): SensorReading[] {
    const rows = this.getLatestByTypeStmt.all(sensorType, limit) as any[];
    return rows.map(this.rowToReading);
  }

  /**
   * Get readings within a time range
   */
  getByTimeRange(sensorId: string, after: Date, before: Date): SensorReading[] {
    const rows = this.getByTimeRangeStmt.all(
      sensorId,
      after.getTime(),
      before.getTime()
    ) as any[];
    return rows.map(this.rowToReading);
  }

  /**
   * Get readings in range (flexible API for tests)
   * Supports: getInRange(sensorId), getInRange(sensorId, after), getInRange(sensorId, undefined, before), getInRange(sensorId, after, before)
   */
  getInRange(sensorId: string, after?: Date, before?: Date): SensorReading[] {
    let sql = 'SELECT * FROM sensor_readings WHERE sensor_id = ?';
    const params: any[] = [sensorId];

    if (after) {
      sql += ' AND timestamp >= ?';
      params.push(after.getTime());
    }

    if (before) {
      sql += ' AND timestamp <= ?';
      params.push(before.getTime());
    }

    sql += ' ORDER BY timestamp DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(this.rowToReading);
  }

  /**
   * Query data after a specific time
   */
  queryAfter(sensorId: string, after: Date): SensorReading[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sensor_readings
      WHERE sensor_id = ? AND timestamp >= ?
      ORDER BY timestamp DESC
    `);
    const rows = stmt.all(sensorId, after.getTime()) as any[];
    return rows.map(this.rowToReading);
  }

  /**
   * Query data before a specific time
   */
  queryBefore(sensorId: string, before: Date): SensorReading[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sensor_readings
      WHERE sensor_id = ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);
    const rows = stmt.all(sensorId, before.getTime()) as any[];
    return rows.map(this.rowToReading);
  }

  /**
   * Perform aggregate query
   */
  aggregate(query: AggregateQuery): AggregateResult {
    let sql = `SELECT ${this.getAggregateSQL(query.function)} as value, COUNT(*) as count
               FROM sensor_readings
               WHERE sensor_id = ?`;

    const params: any[] = [query.sensorId];

    if (query.after) {
      sql += ' AND timestamp >= ?';
      params.push(query.after.getTime());
    }

    if (query.before) {
      sql += ' AND timestamp <= ?';
      params.push(query.before.getTime());
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as any;

    return {
      value: row.value !== null ? Number(row.value) : null,
      count: row.count,
      sensorId: query.sensorId,
      function: query.function,
      timeRange: {
        after: query.after,
        before: query.before
      }
    };
  }

  /**
   * Get SQL for aggregate function
   */
  private getAggregateSQL(func: AggregateFunction): string {
    switch (func) {
      case 'avg':
        return 'AVG(value)';
      case 'min':
        return 'MIN(value)';
      case 'max':
        return 'MAX(value)';
      case 'sum':
        return 'SUM(value)';
      case 'count':
        return 'COUNT(*)';
      default:
        throw new Error(`Unknown aggregate function: ${func}`);
    }
  }

  /**
   * List all sensor IDs in the database
   */
  listSensors(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT sensor_id FROM sensor_readings
      ORDER BY sensor_id
    `);
    const rows = stmt.all() as any[];
    return rows.map(row => row.sensor_id);
  }

  /**
   * Get all unique sensor IDs (alias for listSensors for tests)
   */
  getSensors(): string[] {
    return this.listSensors();
  }

  /**
   * List sensors by type
   */
  listSensorsByType(sensorType: SensorType): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT sensor_id FROM sensor_readings
      WHERE sensor_type = ?
      ORDER BY sensor_id
    `);
    const rows = stmt.all(sensorType) as any[];
    return rows.map(row => row.sensor_id);
  }

  /**
   * Get sensors by type (alias for listSensorsByType for tests)
   */
  getSensorsByType(sensorType: SensorType): string[] {
    return this.listSensorsByType(sensorType);
  }

  /**
   * Delete all readings for a sensor
   */
  deleteBySensor(sensorId: string): number {
    const result = this.deleteBySensorStmt.run(sensorId);
    return result.changes;
  }

  /**
   * Delete a specific sensor (alias for deleteBySensor for tests)
   */
  deleteSensor(sensorId: string): number {
    return this.deleteBySensor(sensorId);
  }

  /**
   * Delete readings within a time range
   */
  deleteByTimeRange(after: Date, before: Date): number {
    const result = this.deleteByTimeRangeStmt.run(after.getTime(), before.getTime());
    return result.changes;
  }

  /**
   * Delete readings older than a specific date
   */
  deleteOlderThan(before: Date): number {
    const stmt = this.db.prepare('DELETE FROM sensor_readings WHERE timestamp <= ?');
    const result = stmt.run(before.getTime());
    return result.changes;
  }

  /**
   * Delete all readings for a sensor type
   */
  deleteBySensorType(sensorType: SensorType): number {
    const result = this.deleteByTypeStmt.run(sensorType);
    return result.changes;
  }

  /**
   * Clear all data from the database
   */
  clear(): number {
    const stmt = this.db.prepare('DELETE FROM sensor_readings');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Get database statistics
   */
  getStatistics(): DataStatistics {
    // Total count
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM sensor_readings');
    const totalRow = totalStmt.get() as any;
    const totalReadings = totalRow.count;

    // By sensor
    const bySensorStmt = this.db.prepare(`
      SELECT sensor_id, COUNT(*) as count
      FROM sensor_readings
      GROUP BY sensor_id
    `);
    const bySensorRows = bySensorStmt.all() as any[];
    const bySensor: Record<string, number> = {};
    for (const row of bySensorRows) {
      bySensor[row.sensor_id] = row.count;
    }

    // By type
    const byTypeStmt = this.db.prepare(`
      SELECT sensor_type, COUNT(*) as count
      FROM sensor_readings
      GROUP BY sensor_type
    `);
    const byTypeRows = byTypeStmt.all() as any[];
    const byType: Record<SensorType, number> = {} as any;
    for (const row of byTypeRows) {
      byType[row.sensor_type as SensorType] = row.count;
    }

    // Oldest/newest
    let oldestReading: Date | undefined;
    let newestReading: Date | undefined;

    if (totalReadings > 0) {
      const oldestStmt = this.db.prepare('SELECT MIN(timestamp) as ts FROM sensor_readings');
      const oldestRow = oldestStmt.get() as any;
      oldestReading = new Date(oldestRow.ts);

      const newestStmt = this.db.prepare('SELECT MAX(timestamp) as ts FROM sensor_readings');
      const newestRow = newestStmt.get() as any;
      newestReading = new Date(newestRow.ts);
    }

    return {
      totalReadings,
      bySensor,
      byType,
      oldestReading,
      newestReading
    };
  }

  /**
   * Get count of readings for a sensor
   */
  count(sensorId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sensor_readings WHERE sensor_id = ?');
    const row = stmt.get(sensorId) as any;
    return row.count;
  }

  /**
   * Get count of readings by type
   */
  countByType(sensorType: SensorType): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sensor_readings WHERE sensor_type = ?');
    const row = stmt.get(sensorType) as any;
    return row.count;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database row to SensorReading
   */
  private rowToReading(row: any): SensorReading {
    return {
      sensorId: row.sensor_id,
      sensorType: row.sensor_type as SensorType,
      value: row.value,
      unit: row.unit,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}
