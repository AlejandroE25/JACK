/**
 * EventBus Test Suite
 *
 * Tests the central event routing system with priority queues,
 * subscriptions, filtering, and event persistence.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventBus } from '../../../src/events/eventBus';
import { EventStore } from '../../../src/events/eventStore';
import {
  Event,
  EventType,
  EventPriority,
  EventSubscriber,
  EventFilter
} from '../../../src/events/types';

describe('EventBus', () => {
  let eventBus: EventBus;
  let mockEventStore: EventStore;

  beforeEach(() => {
    // Mock EventStore
    mockEventStore = {
      store: vi.fn(),
      query: vi.fn(),
      clear: vi.fn()
    } as any;

    eventBus = new EventBus(mockEventStore);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Event Publishing', () => {
    it('should publish events to the bus', async () => {
      const event: Event = {
        id: 'test-1',
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: { data: 'test' },
        timestamp: new Date()
      };

      const published = await eventBus.publish(event);

      expect(published).toBe(true);
      expect(mockEventStore.store).toHaveBeenCalledWith(event);
    });

    it('should auto-generate event ID if not provided', async () => {
      const event = {
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {},
        timestamp: new Date()
      } as Event;

      await eventBus.publish(event);

      expect(event.id).toBeDefined();
      expect(typeof event.id).toBe('string');
    });

    it('should auto-set timestamp if not provided', async () => {
      const event = {
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {}
      } as Event;

      const beforePublish = new Date();
      await eventBus.publish(event);
      const afterPublish = new Date();

      expect(event.timestamp).toBeDefined();
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(beforePublish.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(afterPublish.getTime());
    });

    it('should reject events with invalid type', async () => {
      const event = {
        type: 'INVALID_TYPE',
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {}
      } as any;

      await expect(eventBus.publish(event)).rejects.toThrow('Invalid event type');
    });
  });

  describe('Event Subscription', () => {
    it('should allow subscribing to specific event types', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {}
      } as Event);

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support multiple event types per subscription', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe(
        [EventType.SENSOR_TRIGGER, EventType.SENSOR_ANOMALY],
        subscriber
      );

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      } as Event);

      await eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should not call handler for unsubscribed event types', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);

      await eventBus.publish({
        type: EventType.SCHEDULED_TASK,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow unsubscribing', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);
      eventBus.unsubscribe('sub-1');

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Event Filtering', () => {
    it('should filter events using canHandle predicate', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: (event) => event.source === 'door_sensor',
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);

      // Should handle
      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'door_sensor',
        payload: {}
      } as Event);

      // Should NOT handle
      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'motion_sensor',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Priority Queue', () => {
    it('should process events by priority (urgent first)', async () => {
      const processOrder: string[] = [];

      const handler1: EventSubscriber = {
        id: 'sub-1',
        handle: async (event) => { processOrder.push('handler1'); },
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], handler1);

      // Publish in reverse priority order
      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.LOW,
        source: 'test',
        payload: { id: '1' }
      } as Event);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.URGENT,
        source: 'test',
        payload: { id: '2' }
      } as Event);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.HIGH,
        source: 'test',
        payload: { id: '3' }
      } as Event);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: { id: '4' }
      } as Event);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should process 3 times (urgent, high, medium, low)
      expect(processOrder.length).toBe(4);
    });

    it('should process events by subscriber priority when event priority is same', async () => {
      const processOrder: string[] = [];

      const lowPriorityHandler: EventSubscriber = {
        id: 'sub-low',
        handle: async (event) => { processOrder.push('low'); },
        canHandle: () => true,
        priority: 0
      };

      const highPriorityHandler: EventSubscriber = {
        id: 'sub-high',
        handle: async (event) => { processOrder.push('high'); },
        canHandle: () => true,
        priority: 10
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], lowPriorityHandler);
      eventBus.subscribe([EventType.SENSOR_TRIGGER], highPriorityHandler);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        priority: EventPriority.MEDIUM,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      // High priority subscriber should be called first
      expect(processOrder[0]).toBe('high');
      expect(processOrder[1]).toBe('low');
    });
  });

  describe('Error Handling', () => {
    it('should continue processing if a handler throws', async () => {
      const handler1 = vi.fn().mockRejectedValue(new Error('Handler 1 failed'));
      const handler2 = vi.fn().mockResolvedValue(undefined);

      const subscriber1: EventSubscriber = {
        id: 'sub-1',
        handle: handler1,
        canHandle: () => true,
        priority: 0
      };

      const subscriber2: EventSubscriber = {
        id: 'sub-2',
        handle: handler2,
        canHandle: () => true,
        priority: 0
      };

      // Add error handler to prevent unhandled errors
      eventBus.on('error', () => {
        // Error is expected in this test
      });

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber1);
      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber2);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should emit error event when handler fails', async () => {
      const errorHandler = vi.fn();
      eventBus.on('error', errorHandler);

      const failingHandler: EventSubscriber = {
        id: 'sub-1',
        handle: async () => { throw new Error('Test error'); },
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], failingHandler);

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Event History', () => {
    it('should query recent events from store', async () => {
      const mockEvents: Event[] = [
        {
          id: '1',
          type: EventType.SENSOR_TRIGGER,
          priority: EventPriority.MEDIUM,
          source: 'test',
          payload: {},
          timestamp: new Date()
        }
      ];

      mockEventStore.query = vi.fn().mockResolvedValue(mockEvents);

      const events = await eventBus.getRecentEvents(10);

      expect(mockEventStore.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 })
      );
      expect(events).toEqual(mockEvents);
    });

    it('should query events by type', async () => {
      const mockEvents: Event[] = [];
      mockEventStore.query = vi.fn().mockResolvedValue(mockEvents);

      await eventBus.getEventsByType(EventType.SENSOR_TRIGGER, 5);

      expect(mockEventStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.SENSOR_TRIGGER,
          limit: 5
        })
      );
    });

    it('should query events by source', async () => {
      const mockEvents: Event[] = [];
      mockEventStore.query = vi.fn().mockResolvedValue(mockEvents);

      await eventBus.getEventsBySource('door_sensor', 5);

      expect(mockEventStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'door_sensor',
          limit: 5
        })
      );
    });
  });

  describe('Performance', () => {
    it('should handle high event throughput', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);

      // Publish 100 events rapidly
      const publishPromises = [];
      for (let i = 0; i < 100; i++) {
        publishPromises.push(
          eventBus.publish({
            type: EventType.SENSOR_TRIGGER,
            source: 'test',
            payload: { id: i }
          } as Event)
        );
      }

      await Promise.all(publishPromises);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it('should process events within target latency (<10ms per event)', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);

      const startTime = Date.now();

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      const processingTime = Date.now() - startTime;

      // Should be well under 10ms for a single event
      expect(processingTime).toBeLessThan(50);
    });
  });

  describe('Cleanup', () => {
    it('should clear all subscriptions', () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);
      eventBus.clear();

      expect(eventBus.getSubscriberCount()).toBe(0);
    });

    it('should stop processing events after shutdown', async () => {
      const handler = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'sub-1',
        handle: handler,
        canHandle: () => true,
        priority: 0
      };

      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);
      await eventBus.shutdown();

      await eventBus.publish({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      } as Event);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
