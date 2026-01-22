/**
 * EventBus - Simple pub/sub for component communication
 *
 * Design:
 * - Type-safe event emission and subscription
 * - Handlers are isolated (one failure doesn't stop others)
 * - Unsubscribe returns a cleanup function
 * - `once` for single-fire subscriptions
 *
 * No priority lanes needed because:
 * 1. Speech runs in a separate process (already non-blocking)
 * 2. The simple-vs-complex decision happens in Intent Parser before execution
 * 3. By the time events hit the bus, we already know what to do
 */

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  /**
   * Subscribe to an event type.
   * @returns Unsubscribe function
   */
  on<T>(type: string, handler: Handler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    const typeHandlers = this.handlers.get(type)!;
    typeHandlers.add(handler as Handler<unknown>);

    // Return unsubscribe function
    return () => {
      typeHandlers.delete(handler as Handler<unknown>);
    };
  }

  /**
   * Subscribe to an event type, but only fire once.
   * @returns Unsubscribe function (can prevent the once call if called before emit)
   */
  once<T>(type: string, handler: Handler<T>): () => void {
    const wrappedHandler: Handler<T> = (payload) => {
      unsubscribe();
      handler(payload);
    };

    const unsubscribe = this.on(type, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Emit an event to all subscribed handlers.
   * Handlers are called synchronously in subscription order.
   * Handler errors are caught and logged, not propagated.
   */
  emit<T>(type: string, payload: T): void {
    const typeHandlers = this.handlers.get(type);
    if (!typeHandlers) return;

    // Copy to array to handle unsubscribes during iteration
    const handlersSnapshot = Array.from(typeHandlers);

    for (const handler of handlersSnapshot) {
      // Only call if still subscribed (handler may have unsubscribed itself)
      if (typeHandlers.has(handler)) {
        try {
          handler(payload);
        } catch {
          // Swallow errors to prevent one bad handler from breaking others
          // In production, we'd log this
        }
      }
    }
  }
}
