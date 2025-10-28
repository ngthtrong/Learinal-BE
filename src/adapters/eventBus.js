const {
  enqueueReviewAssigned,
  enqueueReviewCompleted,
} = require('./queue');
const logger = require('../utils/logger');

/**
 * EventBus - Simple event publishing mechanism
 * Routes events to appropriate background job queues
 */
class EventBus {
  constructor() {
    // Event handlers map: eventType -> queue function
    this.handlers = {
      'validation.requested': this._handleValidationRequested.bind(this),
      'review.assigned': this._handleReviewAssigned.bind(this),
      'review.completed': this._handleReviewCompleted.bind(this),
    };
  }

  /**
   * Publish event to appropriate handlers
   * @param {string} eventType - Event identifier
   * @param {object} payload - Event data
   */
  async publish(eventType, payload) {
    try {
      const handler = this.handlers[eventType];
      if (!handler) {
        logger.warn({ eventType }, '[EventBus] No handler for event type');
        return;
      }

      await handler(payload);

      logger.debug({ eventType }, '[EventBus] Event published successfully');
    } catch (error) {
      logger.error(
        { eventType, error: error.message },
        '[EventBus] Failed to publish event'
      );
      // Non-fatal - don't block main operation
    }
  }

  /**
   * Subscribe to event (not implemented - using direct queue dispatch)
   */
  async subscribe(_topic, _handler) {
    throw new Error('NotImplemented - Use queue workers instead');
  }

  // ===== PRIVATE EVENT HANDLERS =====

  async _handleValidationRequested(payload) {
    // For now, just log - admin notification can be added later
    logger.info(
      { requestId: payload.requestId },
      '[EventBus] Validation requested - admin should be notified'
    );
    // TODO: Create admin notification or send email to admin
  }

  async _handleReviewAssigned(payload) {
    // Enqueue job to send notifications to expert
    await enqueueReviewAssigned(payload);
  }

  async _handleReviewCompleted(payload) {
    // Enqueue job to send notifications to learner
    await enqueueReviewCompleted(payload);
  }
}

module.exports = EventBus;
