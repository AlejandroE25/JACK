/**
 * DataStorage Test Suite
 *
 * Tests time-series sensor data storage with SQLite persistence,
 * aggregation queries, and data retention policies.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataStorage } from '../../../src/data/dataStorage';
import { SensorReading, SensorType, AggregateQuery, AggregateResult } from '../../../src/data/types';
import fs from 'fs';
import path from 'path';

describe('DataStorage', () => {
  let dataStorage: DataStorage;
  const testDbPath = path.join(__dirname, '../../fixtures/test-data.db');

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    dataStorage = new DataStorage(testDbPath);
  });

  afterEach(() => {
    dataStorage.close();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Sensor Reading Storage', () => {
    it('should store sensor readings to SQLite database', () => {
      const reading: SensorReading = {
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72.5,
        unit: 'F',
        timestamp: new Date()
      };

      const stored = dataStorage.store(reading);

      expect(stored).toBe(true);
    });

    it('should store readings with all fields', () => {
      const reading: SensorReading = {
        sensorId: 'door-001',
        sensorType: SensorType.DOOR,
        value: 1, // 1 = open, 0 = closed
        unit: 'boolean',
        timestamp: new Date(),
        metadata: {
          location: 'front_door',
          batteryLevel: 85
        }
      };

      dataStorage.store(reading);

      const retrieved = dataStorage.getLatest('door-001', 1);

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].sensorId).toBe('door-001');
      expect(retrieved[0].sensorType).toBe(SensorType.DOOR);
      expect(retrieved[0].value).toBe(1);
      expect(retrieved[0].metadata).toEqual(reading.metadata);
    });

    it('should handle storing multiple readings', () => {
      const readings: SensorReading[] = [];

      for (let i = 0; i < 100; i++) {
        readings.push({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 70 + Math.random() * 10,
          unit: 'F',
          timestamp: new Date(Date.now() + i * 1000)
        });
      }

      readings.forEach(reading => dataStorage.store(reading));

      const retrieved = dataStorage.getLatest('temp-001', 100);

      expect(retrieved.length).toBe(100);
    });

    it('should auto-set timestamp if not provided', () => {
      const reading = {
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72.5,
        unit: 'F'
      } as SensorReading;

      const beforeStore = new Date();
      dataStorage.store(reading);
      const afterStore = new Date();

      const retrieved = dataStorage.getLatest('temp-001', 1);

      expect(retrieved[0].timestamp).toBeDefined();
      expect(retrieved[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeStore.getTime());
      expect(retrieved[0].timestamp.getTime()).toBeLessThanOrEqual(afterStore.getTime());
    });
  });

  describe('Latest Readings Query', () => {
    beforeEach(() => {
      // Seed database with test data
      const baseTime = Date.now();

      for (let i = 0; i < 10; i++) {
        dataStorage.store({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 70 + i,
          unit: 'F',
          timestamp: new Date(baseTime + i * 1000)
        });
      }
    });

    it('should get latest N readings for a sensor', () => {
      const latest = dataStorage.getLatest('temp-001', 5);

      expect(latest.length).toBe(5);
      // Should be newest first
      expect(latest[0].value).toBe(79); // Last reading (70 + 9)
      expect(latest[4].value).toBe(75); // 5th from last
    });

    it('should return readings in reverse chronological order (newest first)', () => {
      const latest = dataStorage.getLatest('temp-001', 10);

      expect(latest.length).toBe(10);

      // Verify descending timestamp order
      for (let i = 0; i < latest.length - 1; i++) {
        expect(latest[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          latest[i + 1].timestamp.getTime()
        );
      }
    });

    it('should return empty array for non-existent sensor', () => {
      const latest = dataStorage.getLatest('non-existent', 10);

      expect(latest).toEqual([]);
    });
  });

  describe('Time Range Queries', () => {
    let baseTime: number;

    beforeEach(() => {
      // Seed with readings every hour for 24 hours
      // Use a fixed base time to avoid Date.now() timing issues
      baseTime = Date.now() - (24 * 60 * 60 * 1000);

      for (let i = 0; i < 24; i++) {
        dataStorage.store({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 65 + Math.sin(i / 4) * 10, // Temperature cycles
          unit: 'F',
          timestamp: new Date(baseTime + i * 60 * 60 * 1000)
        });
      }
    });

    it('should query readings in time range', () => {
      // Use baseTime instead of Date.now() for consistent boundaries
      const after = new Date(baseTime + (12 * 60 * 60 * 1000)); // Hours 12-23
      const before = new Date(baseTime + (24 * 60 * 60 * 1000)); // End time

      const readings = dataStorage.getInRange('temp-001', after, before);

      expect(readings.length).toBe(12);
      expect(readings.every(r =>
        r.timestamp! >= after && r.timestamp! <= before
      )).toBe(true);
    });

    it('should query readings after a timestamp', () => {
      // Use baseTime for consistent boundaries
      const after = new Date(baseTime + (18 * 60 * 60 * 1000)); // Hours 18-23

      const readings = dataStorage.getInRange('temp-001', after);

      expect(readings.length).toBe(6);
      expect(readings.every(r => r.timestamp! >= after)).toBe(true);
    });

    it('should query readings before a timestamp', () => {
      // Use baseTime for consistent boundaries
      const before = new Date(baseTime + (5 * 60 * 60 * 1000)); // Hours 0-5 (inclusive)

      const readings = dataStorage.getInRange('temp-001', undefined, before);

      expect(readings.length).toBe(6); // First 6 hours (0-5 inclusive)
      expect(readings.every(r => r.timestamp! <= before)).toBe(true);
    });

    it('should return all readings when no time range specified', () => {
      const readings = dataStorage.getInRange('temp-001');

      expect(readings.length).toBe(24);
    });
  });

  describe('Aggregate Queries', () => {
    beforeEach(() => {
      // Seed with temperature data
      const baseTime = Date.now() - (60 * 60 * 1000); // Last hour

      const values = [68, 70, 72, 74, 76, 78, 80, 82, 84, 86]; // Clear avg: 77

      for (let i = 0; i < values.length; i++) {
        dataStorage.store({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: values[i],
          unit: 'F',
          timestamp: new Date(baseTime + i * 6 * 60 * 1000) // Every 6 minutes
        });
      }
    });

    it('should calculate average value', () => {
      const result = dataStorage.aggregate({
        sensorId: 'temp-001',
        function: 'avg',
        after: new Date(Date.now() - 2 * 60 * 60 * 1000)
      });

      expect(result.value).toBeCloseTo(77, 1); // Average of 68-86
      expect(result.count).toBe(10);
    });

    it('should calculate min value', () => {
      const result = dataStorage.aggregate({
        sensorId: 'temp-001',
        function: 'min',
        after: new Date(Date.now() - 2 * 60 * 60 * 1000)
      });

      expect(result.value).toBe(68);
      expect(result.count).toBe(10);
    });

    it('should calculate max value', () => {
      const result = dataStorage.aggregate({
        sensorId: 'temp-001',
        function: 'max',
        after: new Date(Date.now() - 2 * 60 * 60 * 1000)
      });

      expect(result.value).toBe(86);
      expect(result.count).toBe(10);
    });

    it('should calculate sum value', () => {
      const result = dataStorage.aggregate({
        sensorId: 'temp-001',
        function: 'sum',
        after: new Date(Date.now() - 2 * 60 * 60 * 1000)
      });

      expect(result.value).toBe(770); // 68+70+72+74+76+78+80+82+84+86
      expect(result.count).toBe(10);
    });

    it('should calculate count', () => {
      const result = dataStorage.aggregate({
        sensorId: 'temp-001',
        function: 'count',
        after: new Date(Date.now() - 2 * 60 * 60 * 1000)
      });

      expect(result.value).toBe(10);
      expect(result.count).toBe(10);
    });

    it('should support time range filtering in aggregates', () => {
      const after = new Date(Date.now() - 40 * 60 * 1000); // Last 40 minutes
      const before = new Date();

      const result = dataStorage.aggregate({
        sensorId: 'temp-001',
        function: 'avg',
        after,
        before
      });

      // Should include only last 7 readings (42 minutes / 6 min intervals)
      expect(result.count).toBeLessThanOrEqual(7);
    });

    it('should return null result for no data', () => {
      const result = dataStorage.aggregate({
        sensorId: 'non-existent',
        function: 'avg'
      });

      expect(result.value).toBeNull();
      expect(result.count).toBe(0);
    });
  });

  describe('Sensor Listing', () => {
    beforeEach(() => {
      // Store readings from multiple sensors with correct types
      dataStorage.store({
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72,
        unit: 'F',
        timestamp: new Date()
      });

      dataStorage.store({
        sensorId: 'temp-002',
        sensorType: SensorType.TEMPERATURE,
        value: 73,
        unit: 'F',
        timestamp: new Date()
      });

      dataStorage.store({
        sensorId: 'door-001',
        sensorType: SensorType.DOOR,
        value: 1,
        unit: 'boolean',
        timestamp: new Date()
      });

      dataStorage.store({
        sensorId: 'motion-001',
        sensorType: SensorType.MOTION,
        value: 1,
        unit: 'boolean',
        timestamp: new Date()
      });
    });

    it('should list all unique sensor IDs', () => {
      const sensors = dataStorage.getSensors();

      expect(sensors.length).toBe(4);
      expect(sensors).toContain('temp-001');
      expect(sensors).toContain('temp-002');
      expect(sensors).toContain('door-001');
      expect(sensors).toContain('motion-001');
    });

    it('should return sensors by type', () => {
      // Add another temperature sensor
      dataStorage.store({
        sensorId: 'temp-003',
        sensorType: SensorType.TEMPERATURE,
        value: 74,
        unit: 'F',
        timestamp: new Date()
      });

      // Add another door sensor
      dataStorage.store({
        sensorId: 'door-002',
        sensorType: SensorType.DOOR,
        value: 0,
        unit: 'boolean',
        timestamp: new Date()
      });

      const tempSensors = dataStorage.getSensorsByType(SensorType.TEMPERATURE);

      expect(tempSensors.length).toBe(3); // temp-001, temp-002, temp-003
      expect(tempSensors.every(id => id.startsWith('temp-'))).toBe(true);
    });
  });

  describe('Data Deletion', () => {
    beforeEach(() => {
      // Seed with old and new data
      const oldTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago

      for (let i = 0; i < 10; i++) {
        dataStorage.store({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 70,
          unit: 'F',
          timestamp: new Date(oldTime + i * 1000)
        });
      }

      for (let i = 0; i < 5; i++) {
        dataStorage.store({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 72,
          unit: 'F',
          timestamp: new Date()
        });
      }
    });

    it('should delete readings older than specified date', () => {
      const cutoffDate = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000)); // 14 days ago

      const deleted = dataStorage.deleteOlderThan(cutoffDate);

      expect(deleted).toBe(10); // All old readings

      const remaining = dataStorage.getLatest('temp-001', 100);
      expect(remaining.length).toBe(5); // Only recent readings
    });

    it('should delete readings for specific sensor', () => {
      // Add readings for another sensor
      dataStorage.store({
        sensorId: 'temp-002',
        sensorType: SensorType.TEMPERATURE,
        value: 72,
        unit: 'F',
        timestamp: new Date()
      });

      const deleted = dataStorage.deleteSensor('temp-001');

      expect(deleted).toBe(15); // All temp-001 readings

      const temp001 = dataStorage.getLatest('temp-001', 100);
      const temp002 = dataStorage.getLatest('temp-002', 100);

      expect(temp001.length).toBe(0);
      expect(temp002.length).toBe(1);
    });

    it('should clear all data', () => {
      const deleted = dataStorage.clear();

      expect(deleted).toBeGreaterThan(0);

      const sensors = dataStorage.getSensors();
      expect(sensors.length).toBe(0);
    });
  });

  describe('Database Schema', () => {
    it('should create readings table on initialization', () => {
      // Table created in beforeEach
      // Verify by storing and retrieving a reading
      const reading: SensorReading = {
        sensorId: 'schema-test',
        sensorType: SensorType.TEMPERATURE,
        value: 72,
        unit: 'F',
        timestamp: new Date()
      };

      dataStorage.store(reading);
      const retrieved = dataStorage.getLatest('schema-test', 1);

      expect(retrieved.length).toBe(1);
    });

    it('should create indexes for time-series performance', () => {
      // Verify indexes exist by checking query performance with large dataset
      const readings: SensorReading[] = [];

      for (let i = 0; i < 1000; i++) {
        readings.push({
          sensorId: i % 10 === 0 ? 'sensor-a' : 'sensor-b',
          sensorType: SensorType.TEMPERATURE,
          value: 70 + Math.random() * 10,
          unit: 'F',
          timestamp: new Date(Date.now() + i * 1000)
        });
      }

      readings.forEach(r => dataStorage.store(r));

      const startTime = Date.now();
      const results = dataStorage.getLatest('sensor-a', 50);
      const queryTime = Date.now() - startTime;

      expect(results.length).toBe(50);
      expect(queryTime).toBeLessThan(50); // Should be very fast with indexes
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      // Seed with diverse sensor data
      const sensors = [
        { id: 'temp-001', type: SensorType.TEMPERATURE, count: 100 },
        { id: 'temp-002', type: SensorType.TEMPERATURE, count: 50 },
        { id: 'door-001', type: SensorType.DOOR, count: 25 }
      ];

      for (const sensor of sensors) {
        for (let i = 0; i < sensor.count; i++) {
          dataStorage.store({
            sensorId: sensor.id,
            sensorType: sensor.type,
            value: Math.random() * 100,
            unit: 'test',
            timestamp: new Date(Date.now() + i * 1000)
          });
        }
      }
    });

    it('should return total reading count', () => {
      const stats = dataStorage.getStatistics();

      expect(stats.totalReadings).toBe(175);
    });

    it('should return count by sensor', () => {
      const stats = dataStorage.getStatistics();

      expect(stats.bySensor['temp-001']).toBe(100);
      expect(stats.bySensor['temp-002']).toBe(50);
      expect(stats.bySensor['door-001']).toBe(25);
    });

    it('should return count by sensor type', () => {
      const stats = dataStorage.getStatistics();

      expect(stats.byType[SensorType.TEMPERATURE]).toBe(150);
      expect(stats.byType[SensorType.DOOR]).toBe(25);
    });

    it('should return oldest and newest timestamps', () => {
      const stats = dataStorage.getStatistics();

      expect(stats.oldestReading).toBeDefined();
      expect(stats.newestReading).toBeDefined();
      expect(stats.newestReading!.getTime()).toBeGreaterThan(stats.oldestReading!.getTime());
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid database path gracefully', () => {
      expect(() => {
        new DataStorage('/invalid/path/to/database.db');
      }).toThrow();
    });

    it('should validate sensor reading data', () => {
      const invalidReading = {
        sensorId: '',
        value: 'not a number'
      } as any;

      expect(() => dataStorage.store(invalidReading)).toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should close database connection cleanly', () => {
      dataStorage.store({
        sensorId: 'test',
        sensorType: SensorType.TEMPERATURE,
        value: 72,
        unit: 'F',
        timestamp: new Date()
      });

      expect(() => dataStorage.close()).not.toThrow();
    });
  });
});
