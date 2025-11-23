/**
 * Simple in-memory event bus for pub/sub messaging
 * For production, consider Redis pub/sub or message queue
 */
const logger = require("../utils/logger");
class EventBus {
  constructor() {
    this.subscribers = new Map(); // topic -> Set of handlers
  }

  async publish(topic, event) {
    const handlers = this.subscribers.get(topic);
    if (!handlers || handlers.size === 0) {
      return;
    }

    // Execute all handlers for this topic
    const promises = Array.from(handlers).map((handler) => {
      try {
        return Promise.resolve(handler(event));
      } catch (error) {
        logger.error({ topic, error }, "EventBus handler error");
        return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);
  }

  async subscribe(topic, handler) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic).add(handler);
  }

  unsubscribe(topic, handler) {
    const handlers = this.subscribers.get(topic);
    if (handlers) {
      handlers.delete(handler);
    }
  }
}

module.exports = EventBus;
