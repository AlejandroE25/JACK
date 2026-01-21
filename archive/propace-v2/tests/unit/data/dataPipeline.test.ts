/**
 * DataPipeline Test Suite
 *
 * Tests data ingestion, batch processing, event publishing,
 * and trend analysis for sensor data.
 *
 * NOTE: Anomaly detection is handled by individual sensor plugins,
 * not centrally by DataPipeline. This keeps processing distributed
 * and allows sensor-specific anomaly logic.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataPipeline } from '../../../src/data/dataPipeline';
import { DataStorage } from '../../../src/data/dataStorage';
import { EventBus } from '../../../src/events/eventBus';
import {
  SensorReading,
  SensorType,
  DataBatch,
  Trend
} from '../../../src/data/types';
import { EventType, EventPriority } from '../../../src/events/types';

describe('DataPipeline', () => {
  let dataPipeline: DataPipeline;
  let mockDataStorage: DataStorage;
  let mockEventBus: EventBus;

  beforeEach(() => {
    // Mock DataStorage
    mockDataStorage = {
      store: vi.fn().mockReturnValue(true),
      getLatest: vi.fn().mockReturnValue([]),
      getInRange: vi.fn().mockReturnValue([]),
      getByTimeRange: vi.fn().mockReturnValue([]),
      aggregate: vi.fn().mockReturnValue({ value: 0, count: 0 })
    } as any;

    // Mock EventBus
    mockEventBus = {
      publish: vi.fn().mockResolvedValue(true),
      subscribe: vi.fn()
    } as any;

    dataPipeline = new DataPipeline(mockDataStorage, mockEventBus);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Data Ingestion', () => {
    it('should ingest single sensor reading', async () => {
      const reading: SensorReading = {
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72.5,
        unit: 'F',
        timestamp: new Date()
      };

      await dataPipeline.ingest(reading);

      expect(mockDataStorage.store).toHaveBeenCalledWith(reading);
    });

    it('should ingest batch of sensor readings', async () => {
      const batch: DataBatch = {
        readings: [
          {
            sensorId: 'temp-001',
            sensorType: SensorType.TEMPERATURE,
            value: 72,
            unit: 'F',
            timestamp: new Date()
          },
          {
            sensorId: 'temp-002',
            sensorType: SensorType.TEMPERATURE,
            value: 74,
            unit: 'F',
            timestamp: new Date()
          }
        ],
        source: 'iot_platform',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch);

      expect(mockDataStorage.store).toHaveBeenCalledTimes(2);
    });

    it('should auto-set timestamp if not provided', async () => {
      const reading = {
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72,
        unit: 'F'
      } as SensorReading;

      const beforeIngest = new Date();
      await dataPipeline.ingest(reading);
      const afterIngest = new Date();

      const storedReading = (mockDataStorage.store as any).mock.calls[0][0];

      expect(storedReading.timestamp).toBeDefined();
      expect(storedReading.timestamp.getTime()).toBeGreaterThanOrEqual(beforeIngest.getTime());
      expect(storedReading.timestamp.getTime()).toBeLessThanOrEqual(afterIngest.getTime());
    });

    it('should validate reading data before storage', async () => {
      const invalidReading = {
        sensorId: '',
        value: 'not a number'
      } as any;

      await expect(dataPipeline.ingest(invalidReading)).rejects.toThrow();
      expect(mockDataStorage.store).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      mockDataStorage.store = vi.fn().mockImplementation(() => {
        throw new Error('Storage failed');
      });

      const reading: SensorReading = {
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72,
        unit: 'F',
        timestamp: new Date()
      };

      await expect(dataPipeline.ingest(reading)).rejects.toThrow('Storage failed');
    });
  });

  describe('Trend Analysis', () => {
    it('should detect increasing trend', async () => {
      // Mock historical data with clear upward trend
      const trendReadings: SensorReading[] = Array.from({ length: 60 }, (_, i) => ({
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 65 + i * 0.5, // Steady increase
        unit: 'F',
        timestamp: new Date(Date.now() - (60 - i) * 60 * 1000)
      }));

      mockDataStorage.getInRange = vi.fn().mockReturnValue(trendReadings);

      const trend = await dataPipeline.analyzeTrend('temp-001', 60);

      expect(trend.direction).toBe('increasing');
      expect(trend.slope).toBeGreaterThan(0);
      expect(trend.confidence).toBeGreaterThan(0.8);
      expect(trend.dataPoints).toBe(60);
    });

    it('should detect decreasing trend', async () => {
      const trendReadings: SensorReading[] = Array.from({ length: 60 }, (_, i) => ({
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 95 - i * 0.5, // Steady decrease
        unit: 'F',
        timestamp: new Date(Date.now() - (60 - i) * 60 * 1000)
      }));

      mockDataStorage.getInRange = vi.fn().mockReturnValue(trendReadings);

      const trend = await dataPipeline.analyzeTrend('temp-001', 60);

      expect(trend.direction).toBe('decreasing');
      expect(trend.slope).toBeLessThan(0);
      expect(trend.confidence).toBeGreaterThan(0.8);
    });

    it('should detect stable (no trend)', async () => {
      // Use constant values with tiny variations for stable result
      const stableReadings: SensorReading[] = Array.from({ length: 60 }, (_, i) => ({
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 72 + (i % 2) * 0.01, // Tiny alternating variation, essentially flat
        unit: 'F',
        timestamp: new Date(Date.now() - (60 - i) * 60 * 1000)
      }));

      mockDataStorage.getInRange = vi.fn().mockReturnValue(stableReadings);

      const trend = await dataPipeline.analyzeTrend('temp-001', 60);

      expect(trend.direction).toBe('stable');
      expect(Math.abs(trend.slope)).toBeLessThan(0.1);
    });

    it('should calculate slope (rate of change per hour)', async () => {
      // Increase by 6 degrees per hour (0.1 per minute)
      const trendReadings: SensorReading[] = Array.from({ length: 60 }, (_, i) => ({
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 70 + i * 0.1,
        unit: 'F',
        timestamp: new Date(Date.now() - (60 - i) * 60 * 1000)
      }));

      mockDataStorage.getInRange = vi.fn().mockReturnValue(trendReadings);

      const trend = await dataPipeline.analyzeTrend('temp-001', 60);

      expect(trend.slope).toBeCloseTo(6, 1); // ~6 degrees per hour
    });

    it('should handle insufficient data for trend analysis', async () => {
      mockDataStorage.getInRange = vi.fn().mockReturnValue([
        {
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 72,
          unit: 'F',
          timestamp: new Date()
        }
      ]);

      await expect(
        dataPipeline.analyzeTrend('temp-001', 60)
      ).rejects.toThrow('Insufficient data');
    });
  });

  describe('Batch Processing', () => {
    it('should process batch efficiently', async () => {
      const batch: DataBatch = {
        readings: Array.from({ length: 100 }, (_, i) => ({
          sensorId: `sensor-${i % 10}`,
          sensorType: SensorType.TEMPERATURE,
          value: 70 + Math.random() * 10,
          unit: 'F',
          timestamp: new Date(Date.now() + i * 1000)
        })),
        source: 'iot_platform',
        receivedAt: new Date()
      };

      const startTime = Date.now();
      await dataPipeline.ingestBatch(batch);
      const processingTime = Date.now() - startTime;

      expect(mockDataStorage.store).toHaveBeenCalledTimes(100);
      expect(processingTime).toBeLessThan(500); // Should be fast
    });

    it('should mark batch as processed', async () => {
      const batch: DataBatch = {
        readings: [
          {
            sensorId: 'temp-001',
            sensorType: SensorType.TEMPERATURE,
            value: 72,
            unit: 'F',
            timestamp: new Date()
          }
        ],
        source: 'test',
        receivedAt: new Date()
      };

      const result = await dataPipeline.ingestBatch(batch);

      expect(result.processed).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(0);
    });

    it('should handle partial batch failures gracefully', async () => {
      // Mock storage to fail on second reading
      let callCount = 0;
      mockDataStorage.store = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Storage failed');
        }
        return true;
      });

      const batch: DataBatch = {
        readings: [
          { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 72, unit: 'F', timestamp: new Date() },
          { sensorId: 'temp-002', sensorType: SensorType.TEMPERATURE, value: 74, unit: 'F', timestamp: new Date() },
          { sensorId: 'temp-003', sensorType: SensorType.TEMPERATURE, value: 76, unit: 'F', timestamp: new Date() }
        ],
        source: 'test',
        receivedAt: new Date()
      };

      const result = await dataPipeline.ingestBatch(batch);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Sensor Hub Integration', () => {
    it('should respect anomaly flags from sensor hub', async () => {
      const batch: DataBatch = {
        readings: [
          {
            sensorId: 'temp-001',
            sensorType: SensorType.TEMPERATURE,
            value: 72,
            unit: 'F',
            timestamp: new Date(),
            metadata: { anomaly: false }
          },
          {
            sensorId: 'temp-001',
            sensorType: SensorType.TEMPERATURE,
            value: 95,
            unit: 'F',
            timestamp: new Date(),
            metadata: {
              anomaly: true,
              anomalyType: 'spike',
              severity: 0.8,
              hubDetected: true
            }
          }
        ],
        source: 'sensor_hub_01',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch);

      // Should publish SENSOR_ANOMALY event for the flagged reading
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.SENSOR_ANOMALY,
          source: 'sensor_hub_01',
          payload: expect.objectContaining({
            reading: expect.objectContaining({
              value: 95,
              metadata: expect.objectContaining({
                anomaly: true,
                hubDetected: true
              })
            })
          })
        })
      );
    });

    it('should handle mixed batches (some flagged, some not)', async () => {
      const batch: DataBatch = {
        readings: [
          { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 70, unit: 'F', timestamp: new Date() },
          { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 95, unit: 'F', timestamp: new Date(), metadata: { anomaly: true, anomalyType: 'spike' } },
          { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 72, unit: 'F', timestamp: new Date() },
          { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 45, unit: 'F', timestamp: new Date(), metadata: { anomaly: true, anomalyType: 'drop' } },
          { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 71, unit: 'F', timestamp: new Date() }
        ],
        source: 'sensor_hub_01',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch);

      // Should store all readings
      expect(mockDataStorage.store).toHaveBeenCalledTimes(5);

      // Should publish 2 anomaly events (for the 2 flagged readings)
      const anomalyCalls = (mockEventBus.publish as any).mock.calls.filter(
        (call: any) => call[0].type === EventType.SENSOR_ANOMALY
      );
      expect(anomalyCalls.length).toBe(2);
    });

    it('should include hub metadata in anomaly events', async () => {
      const batch: DataBatch = {
        readings: [
          {
            sensorId: 'temp-001',
            sensorType: SensorType.TEMPERATURE,
            value: 110,
            unit: 'F',
            timestamp: new Date(),
            metadata: {
              anomaly: true,
              anomalyType: 'out_of_range',
              severity: 0.95,
              hubDetected: true,
              hubId: 'raspberry-pi-01',
              hubVersion: '2.1.0'
            }
          }
        ],
        source: 'sensor_hub_01',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.SENSOR_ANOMALY,
          payload: expect.objectContaining({
            reading: expect.objectContaining({
              metadata: expect.objectContaining({
                hubId: 'raspberry-pi-01',
                hubVersion: '2.1.0',
                hubDetected: true
              })
            })
          })
        })
      );
    });

    it('should handle batches from multiple hub sources', async () => {
      const batch1: DataBatch = {
        readings: [
          { sensorId: 'hub1-temp-001', sensorType: SensorType.TEMPERATURE, value: 72, unit: 'F', timestamp: new Date() }
        ],
        source: 'sensor_hub_01',
        receivedAt: new Date()
      };

      const batch2: DataBatch = {
        readings: [
          { sensorId: 'hub2-temp-001', sensorType: SensorType.TEMPERATURE, value: 74, unit: 'F', timestamp: new Date() }
        ],
        source: 'sensor_hub_02',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch1);
      await dataPipeline.ingestBatch(batch2);

      const stats = dataPipeline.getStatistics();

      expect(stats.totalIngested).toBe(2);
      expect(stats.batchesProcessed).toBe(2);
    });

    it('should prioritize hub-detected anomalies (high priority)', async () => {
      const batch: DataBatch = {
        readings: [
          {
            sensorId: 'temp-001',
            sensorType: SensorType.TEMPERATURE,
            value: 150,
            unit: 'F',
            timestamp: new Date(),
            metadata: {
              anomaly: true,
              anomalyType: 'critical',
              severity: 1.0,
              hubDetected: true
            }
          }
        ],
        source: 'sensor_hub_01',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch);

      // Hub-detected anomalies should be published with HIGH or URGENT priority
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.SENSOR_ANOMALY,
          priority: expect.stringMatching(/high|urgent/i)
        })
      );
    });
  });

  describe('Data Query Helpers', () => {
    it('should get recent readings for a sensor', async () => {
      const mockReadings: SensorReading[] = [
        { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 72, unit: 'F', timestamp: new Date() },
        { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 73, unit: 'F', timestamp: new Date() },
        { sensorId: 'temp-001', sensorType: SensorType.TEMPERATURE, value: 74, unit: 'F', timestamp: new Date() }
      ];

      mockDataStorage.getLatest = vi.fn().mockReturnValue(mockReadings);

      const readings = await dataPipeline.getRecentReadings('temp-001', 3);

      expect(readings).toEqual(mockReadings);
      expect(mockDataStorage.getLatest).toHaveBeenCalledWith('temp-001', 3);
    });

    it('should calculate average for time window', async () => {
      mockDataStorage.aggregate = vi.fn().mockReturnValue({
        value: 71.5,
        count: 10,
        sensorId: 'temp-001',
        function: 'avg'
      });

      const avg = await dataPipeline.getAverage('temp-001', 60);

      expect(avg).toBeCloseTo(71.5, 1);
      expect(mockDataStorage.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          sensorId: 'temp-001',
          function: 'avg'
        })
      );
    });

    it('should get min/max for time window', async () => {
      mockDataStorage.aggregate = vi.fn()
        .mockReturnValueOnce({ value: 65, count: 10, sensorId: 'temp-001', function: 'min' })
        .mockReturnValueOnce({ value: 85, count: 10, sensorId: 'temp-001', function: 'max' });

      const min = await dataPipeline.getMin('temp-001', 60);
      const max = await dataPipeline.getMax('temp-001', 60);

      expect(min).toBe(65);
      expect(max).toBe(85);
    });
  });

  describe('Statistics', () => {
    it('should track ingestion statistics', async () => {
      const readings: SensorReading[] = Array.from({ length: 10 }, (_, i) => ({
        sensorId: 'temp-001',
        sensorType: SensorType.TEMPERATURE,
        value: 70 + i,
        unit: 'F',
        timestamp: new Date()
      }));

      for (const reading of readings) {
        await dataPipeline.ingest(reading);
      }

      const stats = dataPipeline.getStatistics();

      expect(stats.totalIngested).toBe(10);
      expect(stats.lastIngestion).toBeDefined();
    });

    it('should track batch processing statistics', async () => {
      const batch: DataBatch = {
        readings: Array.from({ length: 50 }, (_, i) => ({
          sensorId: 'temp-001',
          sensorType: SensorType.TEMPERATURE,
          value: 70 + i,
          unit: 'F',
          timestamp: new Date()
        })),
        source: 'test',
        receivedAt: new Date()
      };

      await dataPipeline.ingestBatch(batch);

      const stats = dataPipeline.getStatistics();

      expect(stats.totalIngested).toBe(50);
      expect(stats.batchesProcessed).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should stop all background tasks on shutdown', async () => {
      await dataPipeline.shutdown();

      // Verify no errors after shutdown
      expect(() => dataPipeline.shutdown()).not.toThrow();
    });
  });
});
