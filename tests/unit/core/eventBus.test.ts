import { describe, test, expect, mock } from 'bun:test';
import { EventBus } from '../../../src/core/eventBus';

describe('EventBus', () => {
  describe('emit and on', () => {
    test('delivers event to subscribed handler', () => {
      const bus = new EventBus();
      const handler = mock(() => {});

      bus.on('test', handler);
      bus.emit('test', { data: 'hello' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'hello' });
    });

    test('delivers event to multiple handlers', () => {
      const bus = new EventBus();
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      bus.on('test', handler1);
      bus.on('test', handler2);
      bus.emit('test', { data: 'hello' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('does not deliver to handlers of different event types', () => {
      const bus = new EventBus();
      const handler = mock(() => {});

      bus.on('type-a', handler);
      bus.emit('type-b', { data: 'hello' });

      expect(handler).not.toHaveBeenCalled();
    });

    test('delivers typed payload correctly', () => {
      const bus = new EventBus();
      interface TestPayload {
        name: string;
        count: number;
      }

      let receivedPayload: TestPayload | null = null;
      bus.on<TestPayload>('test', (payload) => {
        receivedPayload = payload;
      });

      bus.emit<TestPayload>('test', { name: 'jack', count: 42 });

      expect(receivedPayload).toEqual({ name: 'jack', count: 42 });
    });
  });

  describe('unsubscribe', () => {
    test('returns unsubscribe function that works', () => {
      const bus = new EventBus();
      const handler = mock(() => {});

      const unsubscribe = bus.on('test', handler);
      bus.emit('test', {});
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      bus.emit('test', {});
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    test('only unsubscribes the specific handler', () => {
      const bus = new EventBus();
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      const unsub1 = bus.on('test', handler1);
      bus.on('test', handler2);

      unsub1();
      bus.emit('test', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('unsubscribe is idempotent', () => {
      const bus = new EventBus();
      const handler = mock(() => {});

      const unsubscribe = bus.on('test', handler);
      unsubscribe();
      unsubscribe(); // Should not throw
      unsubscribe();

      bus.emit('test', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    test('handler is called only once', () => {
      const bus = new EventBus();
      const handler = mock(() => {});

      bus.once('test', handler);
      bus.emit('test', { n: 1 });
      bus.emit('test', { n: 2 });
      bus.emit('test', { n: 3 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ n: 1 });
    });

    test('returns unsubscribe function that prevents the once call', () => {
      const bus = new EventBus();
      const handler = mock(() => {});

      const unsubscribe = bus.once('test', handler);
      unsubscribe();
      bus.emit('test', {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    test('emitting with no handlers does not throw', () => {
      const bus = new EventBus();

      expect(() => bus.emit('nonexistent', {})).not.toThrow();
    });

    test('handler can unsubscribe itself during emit', () => {
      const bus = new EventBus();
      const results: number[] = [];

      let unsub: () => void;
      unsub = bus.on('test', () => {
        results.push(1);
        unsub();
      });
      bus.on('test', () => results.push(2));

      bus.emit('test', {});
      bus.emit('test', {});

      // First emit: both handlers called
      // Second emit: only handler 2 called
      expect(results).toEqual([1, 2, 2]);
    });

    test('handler errors do not prevent other handlers from running', () => {
      const bus = new EventBus();
      const results: string[] = [];

      bus.on('test', () => results.push('a'));
      bus.on('test', () => {
        throw new Error('intentional');
      });
      bus.on('test', () => results.push('c'));

      // Should not throw, but error is swallowed
      expect(() => bus.emit('test', {})).not.toThrow();
      expect(results).toEqual(['a', 'c']);
    });

    test('handles many subscribers efficiently', () => {
      const bus = new EventBus();
      const handlers = Array.from({ length: 1000 }, () => mock(() => {}));

      handlers.forEach((h) => bus.on('test', h));
      bus.emit('test', {});

      handlers.forEach((h) => expect(h).toHaveBeenCalledTimes(1));
    });
  });
});
