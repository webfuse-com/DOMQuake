// src/EventEmitter.ts
var WILDCARD_EVENT_NAME = "*";
var EventEmitter = class {
  listeners = {
    on: /* @__PURE__ */ new Map(),
    once: /* @__PURE__ */ new Map()
  };
  getListeners(listenerMap, event) {
    !listenerMap.has(event) && listenerMap.set(event, []);
    return listenerMap.get(event);
  }
  on(event, listener) {
    this.getListeners(this.listeners.on, event).push(listener);
    return this;
  }
  once(event, listener) {
    this.getListeners(this.listeners.once, event).push(listener);
    return this;
  }
  emit(event, arg) {
    this.getListeners(this.listeners.once, event).forEach((listener) => listener(arg));
    this.getListeners(this.listeners.once, WILDCARD_EVENT_NAME).forEach((listener) => listener(event, arg));
    this.getListeners(this.listeners.on, event).forEach((listener) => listener(arg));
    this.getListeners(this.listeners.on, WILDCARD_EVENT_NAME).forEach((listener) => listener(event, arg));
    this.listeners.once.set(event, []);
    this.listeners.once.set(WILDCARD_EVENT_NAME, []);
  }
};
export {
  EventEmitter
};
