(() => {
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

  // src/DOMQuake.ts
  var CONSTRAINTS = {
    htmlDelta: {
      maxDepthForSampling: 4,
      maxHTMLLength: 5e4,
      significantInjectionChars: 1e3
    },
    maxDOMMeasureDepth: 32
  };
  var WEIGHTS = {
    mutationTypeFactors: {
      childList: 1,
      attributes: 0.4,
      characterData: 0.1
    }
  };
  var DEFAULT_OPTIONS = {
    quiescenceTicks: 3,
    threshold: 0.5,
    tickMs: 50,
    windowTicks: 6
  };
  var DOMQuake = class extends EventEmitter {
    options;
    emitOnTick;
    subtreeSizes;
    currentState;
    domDepth;
    domIntensity;
    totalNodeCount;
    idleInTransitionTicks;
    mutationEvents;
    pendingMutationRecords;
    hasStaleDOMMeasures;
    mutationObserver;
    tickInterval;
    constructor(options = {}, emitOnTick = false) {
      super();
      const optionsWithDefaults = {
        ...DEFAULT_OPTIONS,
        root: window.document.documentElement,
        ...options
      };
      this.options = optionsWithDefaults;
      this.emitOnTick = emitOnTick;
      this.reset();
    }
    reset() {
      this.mutationObserver?.disconnect();
      clearInterval(this.tickInterval ?? void 0);
      this.subtreeSizes = /* @__PURE__ */ new WeakMap();
      this.currentState = "transition";
      this.domDepth = 0;
      this.totalNodeCount = 0;
      this.idleInTransitionTicks = 0;
      this.mutationEvents = [];
      this.pendingMutationRecords = [];
      this.domIntensity = null;
      this.hasStaleDOMMeasures = false;
      this.mutationObserver = null;
      this.tickInterval = null;
    }
    computeStructuralFactor(node, depth) {
      const subtreeSize = this.subtreeSizes.get(node);
      if (subtreeSize === void 0) return 0;
      const subtreeFraction = subtreeSize / this.totalNodeCount;
      const normalizedDepth = depth / (this.domDepth || depth);
      const depthFactor = 1 / Math.sqrt(normalizedDepth + 1);
      return subtreeFraction * depthFactor;
    }
    computeHTMLDeltaFactor(record, depth) {
      if (depth > CONSTRAINTS.htmlDelta.maxDepthForSampling) {
        const nodeCount = record.addedNodes.length + record.removedNodes.length;
        return Math.log2(nodeCount + 1) + 1;
      }
      const affectedNodes = [
        ...Array.from(record.addedNodes),
        ...Array.from(record.removedNodes)
      ];
      const totalHtmlDelta = affectedNodes.reduce((sum, node) => {
        const html = node.outerHTML ?? node.textContent ?? "";
        const htmlSize = Math.min(html.length, CONSTRAINTS.htmlDelta.maxHTMLLength);
        return sum + htmlSize;
      }, 0);
      if (totalHtmlDelta >= CONSTRAINTS.htmlDelta.significantInjectionChars) {
        this.hasStaleDOMMeasures = true;
      }
      return Math.log2(totalHtmlDelta + 1) + 1;
    }
    computeWeight(record) {
      const typeFactor = WEIGHTS.mutationTypeFactors[record.type];
      if (typeFactor === void 0) return 0;
      const depth = this.measureNodeDepth(record.target);
      const structuralFactor = this.computeStructuralFactor(record.target, depth);
      if (structuralFactor === 0) return 0;
      const sizeFactor = this.computeHTMLDeltaFactor(record, depth);
      return structuralFactor * sizeFactor * typeFactor;
    }
    computeWindowSum(tNow) {
      const cutoff = tNow - this.options.windowTicks * this.options.tickMs;
      let i = 0;
      while (i < this.mutationEvents.length && this.mutationEvents[i].timestamp < cutoff) {
        i++;
      }
      if (i > 0) {
        this.mutationEvents = this.mutationEvents.slice(i);
      }
      return this.mutationEvents.reduce((sum, event) => sum + event.weight, 0);
    }
    measureNodeDepth(node) {
      let depth = 0;
      let current = node;
      while (current.parentNode && depth < CONSTRAINTS.maxDOMMeasureDepth) {
        current = current.parentNode;
        depth++;
      }
      return depth;
    }
    measureDOM() {
      const nodes = [...this.options.root.querySelectorAll("*")];
      const sizes = /* @__PURE__ */ new WeakMap();
      for (const node of nodes.reverse()) {
        let size = node.children.length;
        for (const child of node.children) {
          size += sizes.get(child) ?? 0;
        }
        sizes.set(node, size);
      }
      this.domDepth = 0;
      for (const node of nodes) {
        this.subtreeSizes.set(node, sizes.get(node) ?? 1);
        this.domDepth = Math.max(this.domDepth, this.measureNodeDepth(node));
      }
      this.totalNodeCount = nodes.length;
      this.domIntensity = nodes.reduce((sum, node) => {
        const depth = this.measureNodeDepth(node);
        return sum + this.computeStructuralFactor(node, depth);
      }, 0);
    }
    flushPendingRecords() {
      if (this.pendingMutationRecords.length === 0) return;
      if (this.hasStaleDOMMeasures) {
        const snapshot = this.pendingMutationRecords;
        this.pendingMutationRecords = [];
        this.measureDOM();
        this.pendingMutationRecords = snapshot;
        this.hasStaleDOMMeasures = false;
      }
      const tNow = performance.now();
      for (const record of this.pendingMutationRecords) {
        const weight = this.computeWeight(record);
        if (weight === 0) continue;
        const existingIndex = this.mutationEvents.findIndex((e) => e.target === record.target);
        if (existingIndex >= 0) {
          this.mutationEvents[existingIndex].weight = Math.max(
            this.mutationEvents[existingIndex].weight,
            weight
          );
        } else {
          this.mutationEvents.push({
            target: record.target,
            timestamp: tNow,
            weight
          });
        }
      }
      this.pendingMutationRecords = [];
    }
    tick() {
      this.flushPendingRecords();
      const now = performance.now();
      const intensity = this.computeWindowSum(now);
      const relativeIntensity = intensity / (this.domIntensity ?? 1);
      const isAboveThreshold = relativeIntensity >= this.options.threshold;
      if (isAboveThreshold && this.currentState === "transition" || !isAboveThreshold && this.currentState === "idle") {
        this.emitOnTick && this.emit("tick", { intensity: relativeIntensity });
        return;
      }
      if (isAboveThreshold) {
        this.idleInTransitionTicks = 0;
        this.currentState = "transition";
      } else {
        this.idleInTransitionTicks++;
        if (this.idleInTransitionTicks < this.options.quiescenceTicks) return;
        this.currentState = "idle";
        this.mutationEvents = [];
        this.hasStaleDOMMeasures = true;
      }
      this.emit(this.currentState, {
        intensity: relativeIntensity
      });
    }
    observe() {
      this.measureDOM();
      this.mutationObserver = new MutationObserver((records) => {
        this.pendingMutationRecords.push(...records);
      });
      this.mutationObserver.observe(this.options.root, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      this.tick();
      this.tickInterval = setInterval(() => this.tick(), this.options.tickMs);
      return this;
    }
    disconnect() {
      this.reset();
      return this;
    }
  };

  // src/api.ts
  window.DOMQuake = DOMQuake;
})();
