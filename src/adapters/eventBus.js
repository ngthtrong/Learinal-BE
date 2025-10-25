class EventBus {
  constructor(/* options */) {}
  async publish(/* topic, event */) { throw new Error('NotImplemented'); }
  async subscribe(/* topic, handler */) { throw new Error('NotImplemented'); }
}

module.exports = EventBus;
