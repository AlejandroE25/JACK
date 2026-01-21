/**
 * EventStore Test Suite
 *
 * Tests SQLite-based event persistence with time-series queries,
 * filtering, and automatic cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventStore } from '../../../src/events/eventStore';
import {
  Event,
  EventType,
  EventPriority,
  EventQuery
} from '../../../src/events/types';
import fs from 'fs';
import path from 'path';

describe('EventStore', () => {
  let eventStore: EventStore;
  const testDbPath = path.join(__dirname, '../../fixtures/test-events.db');

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    eventStore = new EventStore(testDbPath);
  });

  afterEach(() => {
    eventStore.close();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Event Storage', () => {
    it('should store events to SQLite database', () => {
      const event: Event = {
        id: 'test-1',
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'door_sensor',
        payload: { status: 'open' },
        timestamp: new Date()
      };

      const stored = eventStore.store(event);

      expect(stored).toBe(true);
    });

    it('should store events with all fields', () => {
      const event: Event = {
        id: 'test-2',
        type: EventType.SENSOR_ANOMALY,
        priority: EventPriority.URGENT,
        source: 'temperature_sensor',
        payload: {
          temperature: 85,
          threshold: 75,
          severity: 'high'
        },
        timestamp: new Date(),
        metadata: {
          location: 'server_room',
          deviceId: 'temp-001'
        }
      };

      eventStore.store(event);

      const retrieved = eventStore.query({ id: 'test-2' });

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe('test-2');
      expect(retrieved[0].type).toBe(EventType.SENSOR_ANOMALY);
      expect(retrieved[0].priority).toBe(EventPriority.URGENT);
      expect(retrieved[0].source).toBe('temperature_sensor');
      expect(retrieved[0].payload).toEqual(event.payload);
      expect(retrieved[0].metadata).toEqual(event.metadata);
    });

    it('should handle JSON payload serialization', () => {
      const complexPayload = {
        nested: {
          data: {
            value: 123,
            array: [1, 2, 3],
            bool: true
          }
        }
      };

      const event: Event = {
        id: 'test-3',
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: complexPayload,
        timestamp: new Date()
      };

      eventStore.store(event);

      const retrieved = eventStore.query({ id: 'test-3' });

      expect(retrieved[0].payload).toEqual(complexPayload);
    });

    it('should handle storing multiple events', () => {
      const events: Event[] = [];

      for (let i = 0; i < 10; i++) {
        events.push({
          id: `event-${i}`,
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.MEDIUM,
          source: 'test',
          payload: { index: i },
          timestamp: new Date(Date.now() + i * 1000) // Stagger timestamps
        });
      }

      events.forEach(event => eventStore.store(event));

      const retrieved = eventStore.query({ limit: 20 });

      expect(retrieved.length).toBe(10);
    });
  });

  describe('Event Querying', () => {
    beforeEach(() => {
      // Seed database with test events
      const baseTime = Date.now();

      const events: Event[] = [
        {
          id: 'sensor-1',
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.HIGH,
          source: 'door_sensor',
          payload: { status: 'open' },
          timestamp: new Date(baseTime - 5000)
        },
        {
          id: 'sensor-2',
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.MEDIUM,
          source: 'motion_sensor',
          payload: { detected: true },
          timestamp: new Date(baseTime - 4000)
        },
        {
          id: 'anomaly-1',
          type: EventType.SENSOR_ANOMALY,
          priority: EventPriority.URGENT,
          source: 'temperature_sensor',
          payload: { temperature: 90 },
          timestamp: new Date(baseTime - 3000)
        },
        {
          id: 'task-1',
          type: EventType.SCHEDULED_TASK,
          priority: EventPriority.LOW,
          source: 'calendar_monitor',
          payload: { task: 'check_visitors' },
          timestamp: new Date(baseTime - 2000)
        },
        {
          id: 'sensor-3',
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.MEDIUM,
          source: 'door_sensor',
          payload: { status: 'closed' },
          timestamp: new Date(baseTime - 1000)
        }
      ];

      events.forEach(event => eventStore.store(event));
    });

    it('should query all events with limit', () => {
      const events = eventStore.query({ limit: 10 });

      expect(events.length).toBe(5);
    });

    it('should query events by type', () => {
      const events = eventStore.query({
        type: EventType.SENSOR_TRIGGER
      });

      expect(events.length).toBe(3);
      expect(events.every(e => e.type === EventType.SENSOR_TRIGGER)).toBe(true);
    });

    it('should query events by source', () => {
      const events = eventStore.query({
        source: 'door_sensor'
      });

      expect(events.length).toBe(2);
      expect(events.every(e => e.source === 'door_sensor')).toBe(true);
    });

    it('should query events by priority', () => {
      const events = eventStore.query({
        priority: EventPriority.URGENT
      });

      expect(events.length).toBe(1);
      expect(events[0].priority).toBe(EventPriority.URGENT);
    });

    it('should query events by ID', () => {
      const events = eventStore.query({ id: 'sensor-1' });

      expect(events.length).toBe(1);
      expect(events[0].id).toBe('sensor-1');
    });

    it('should query events after a timestamp', () => {
      const afterTime = new Date(Date.now() - 3500);

      const events = eventStore.query({ after: afterTime });

      // Should get events: anomaly-1, task-1, sensor-3
      expect(events.length).toBe(3);
    });

    it('should query events before a timestamp', () => {
      const beforeTime = new Date(Date.now() - 3500);

      const events = eventStore.query({ before: beforeTime });

      // Should get events: sensor-1, sensor-2
      expect(events.length).toBe(2);
    });

    it('should query events in time range', () => {
      const after = new Date(Date.now() - 4500);
      const before = new Date(Date.now() - 2500);

      const events = eventStore.query({ after, before });

      // Should get events: sensor-2, anomaly-1
      expect(events.length).toBe(2);
    });

    it('should combine multiple query filters', () => {
      const events = eventStore.query({
        type: EventType.SENSOR_TRIGGER,
        source: 'door_sensor',
        limit: 10
      });

      expect(events.length).toBe(2);
      expect(events.every(e =>
        e.type === EventType.SENSOR_TRIGGER &&
        e.source === 'door_sensor'
      )).toBe(true);
    });

    it('should return events in reverse chronological order (newest first)', () => {
      const events = eventStore.query({ limit: 5 });

      expect(events.length).toBe(5);

      // Verify descending timestamp order
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          events[i + 1].timestamp.getTime()
        );
      }
    });

    it('should respect limit parameter', () => {
      const events = eventStore.query({ limit: 2 });

      expect(events.length).toBe(2);
    });

    it('should return empty array when no events match', () => {
      const events = eventStore.query({
        type: EventType.DECISION_MADE
      });

      expect(events).toEqual([]);
    });
  });

  describe('Event Deletion', () => {
    beforeEach(() => {
      // Seed with events
      for (let i = 0; i < 5; i++) {
        eventStore.store({
          id: `event-${i}`,
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.MEDIUM,
          source: 'test',
          payload: {},
          timestamp: new Date()
        });
      }
    });

    it('should delete events older than specified age', () => {
      const oldTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Add an old event
      eventStore.store({
        id: 'old-event',
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {},
        timestamp: oldTimestamp
      });

      const deleted = eventStore.deleteOlderThan(
        new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // Delete older than 6 days
      );

      expect(deleted).toBe(1);

      const remaining = eventStore.query({ limit: 10 });
      expect(remaining.length).toBe(5);
    });

    it('should clear all events', () => {
      const deleted = eventStore.clear();

      expect(deleted).toBeGreaterThan(0);

      const events = eventStore.query({ limit: 10 });
      expect(events.length).toBe(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const events: Event[] = [
        {
          id: '1',
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.HIGH,
          source: 'door_sensor',
          payload: {},
          timestamp: new Date()
        },
        {
          id: '2',
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.MEDIUM,
          source: 'door_sensor',
          payload: {},
          timestamp: new Date()
        },
        {
          id: '3',
          type: EventType.SENSOR_ANOMALY,
          priority: EventPriority.URGENT,
          source: 'temperature_sensor',
          payload: {},
          timestamp: new Date()
        }
      ];

      events.forEach(e => eventStore.store(e));
    });

    it('should return total event count', () => {
      const stats = eventStore.getStatistics();

      expect(stats.totalEvents).toBe(3);
    });

    it('should return events by type', () => {
      const stats = eventStore.getStatistics();

      expect(stats.byType[EventType.SENSOR_TRIGGER]).toBe(2);
      expect(stats.byType[EventType.SENSOR_ANOMALY]).toBe(1);
    });

    it('should return events by source', () => {
      const stats = eventStore.getStatistics();

      expect(stats.bySource['door_sensor']).toBe(2);
      expect(stats.bySource['temperature_sensor']).toBe(1);
    });

    it('should return events by priority', () => {
      const stats = eventStore.getStatistics();

      expect(stats.byPriority[EventPriority.HIGH]).toBe(1);
      expect(stats.byPriority[EventPriority.MEDIUM]).toBe(1);
      expect(stats.byPriority[EventPriority.URGENT]).toBe(1);
    });
  });

  describe('Database Schema', () => {
    it('should create events table on initialization', () => {
      // Table created in beforeEach
      // Verify by storing and retrieving an event
      const event: Event = {
        id: 'schema-test',
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {},
        timestamp: new Date()
      };

      eventStore.store(event);
      const retrieved = eventStore.query({ id: 'schema-test' });

      expect(retrieved.length).toBe(1);
    });

    it('should create indexes for performance', () => {
      // Verify indexes exist by checking query performance
      // with large dataset

      const events: Event[] = [];
      for (let i = 0; i < 100; i++) {
        events.push({
          id: `perf-${i}`,
          type: i % 2 === 0 ? EventType.SENSOR_TRIGGER : EventType.SENSOR_ANOMALY,
          priority: EventPriority.MEDIUM,
          source: i % 3 === 0 ? 'sensor-a' : 'sensor-b',
          payload: {},
          timestamp: new Date(Date.now() + i * 1000)
        });
      }

      events.forEach(e => eventStore.store(e));

      const startTime = Date.now();
      const results = eventStore.query({
        type: EventType.SENSOR_TRIGGER,
        limit: 50
      });
      const queryTime = Date.now() - startTime;

      expect(results.length).toBe(50);
      expect(queryTime).toBeLessThan(50); // Should be very fast with indexes
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid database path gracefully', () => {
      expect(() => {
        new EventStore('/invalid/path/to/database.db');
      }).toThrow();
    });

    it('should handle malformed event data', () => {
      const badEvent = {
        id: 'bad',
        type: 'INVALID_TYPE',
        source: 'test',
        payload: {},
        timestamp: new Date()
      } as any;

      expect(() => eventStore.store(badEvent)).toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should close database connection cleanly', () => {
      eventStore.store({
        id: 'test',
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {},
        timestamp: new Date()
      });

      expect(() => eventStore.close()).not.toThrow();
    });
  });
});
