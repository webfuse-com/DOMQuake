const WILDCARD_EVENT_NAME = "*";
class EventEmitter {
  listeners = {
    on: /* @__PURE__ */ new Map(),
    once: /* @__PURE__ */ new Map()
  };
  getListeners(listenerMap, event) {
    !listenerMap.has(event) && listenerMap.set(event, /* @__PURE__ */ new Set());
    return listenerMap.get(event);
  }
  on(event, listener) {
    this.getListeners(this.listeners.on, event).add(listener);
    return this;
  }
  once(event, listener) {
    this.getListeners(this.listeners.once, event).add(listener);
    return this;
  }
  off(event, listener) {
    this.getListeners(this.listeners.on, event).delete(listener);
    this.getListeners(this.listeners.once, event).delete(listener);
    return this;
  }
  emit(event, arg) {
    [...this.getListeners(this.listeners.once, event)].forEach((listener) => listener(arg));
    [...this.getListeners(this.listeners.once, WILDCARD_EVENT_NAME)].forEach((listener) => listener(event, arg));
    [...this.getListeners(this.listeners.on, event)].forEach((listener) => listener(arg));
    [...this.getListeners(this.listeners.on, WILDCARD_EVENT_NAME)].forEach((listener) => listener(event, arg));
    this.listeners.once.set(event, /* @__PURE__ */ new Set());
    this.listeners.once.set(WILDCARD_EVENT_NAME, /* @__PURE__ */ new Set());
  }
}
export {
  EventEmitter
};
