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
    exitThreshold: 0.02,
    intensityDecayFactor: 0.25,
    maxDecayRampTicks: 40,
    maxDOMMeasureDepth: 32,
    maxHTMLDeltaDepthForSampling: 4,
    maxHTMLDeltaLength: 5e4
  };
  var MUTATION_WEIGHTS = {
    childList: 1,
    attributes: 0.4,
    characterData: 0.1
  };
  var DEFAULT_OPTIONS = {
    threshold: 0.5,
    tickMs: 50,
    windowTicks: 6
  };
  var DOMQuake = class extends EventEmitter {
    options;
    emitOnTick;
    subtreeSizes;
    nodeDOMDepths;
    currentState;
    domDepth;
    domIntensity;
    totalNodeCount;
    decayedIntensity;
    mutationEvents;
    pendingMutationRecords;
    hasStaleDOMMeasures;
    mutationObserver;
    tickInterval;
    transitionTicks;
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
      this.nodeDOMDepths = /* @__PURE__ */ new WeakMap();
      this.currentState = "transition";
      this.domDepth = 0;
      this.totalNodeCount = 0;
      this.decayedIntensity = 0;
      this.mutationEvents = [];
      this.pendingMutationRecords = [];
      this.domIntensity = null;
      this.hasStaleDOMMeasures = false;
      this.mutationObserver = null;
      this.tickInterval = null;
      this.transitionTicks = CONSTRAINTS.maxDecayRampTicks;
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
      if (depth > CONSTRAINTS.maxHTMLDeltaDepthForSampling) {
        const nodeCount = record.addedNodes.length + record.removedNodes.length;
        return Math.log2(nodeCount + 1) + 1;
      }
      const affectedNodes = [
        ...Array.from(record.addedNodes),
        ...Array.from(record.removedNodes)
      ];
      const totalHTMLDelta = affectedNodes.reduce((sum, node) => {
        const html = node.outerHTML ?? node.textContent ?? "";
        const htmlSize = Math.min(html.length, CONSTRAINTS.maxHTMLDeltaLength);
        return sum + htmlSize;
      }, 0);
      return Math.log2(totalHTMLDelta + 1) + 1;
    }
    resolveTarget(node) {
      let resolvedNode = node;
      while (resolvedNode.nodeType !== Node.ELEMENT_NODE && resolvedNode.parentNode) {
        resolvedNode = resolvedNode.parentNode;
      }
      return resolvedNode;
    }
    computeWeight(record) {
      const typeFactor = MUTATION_WEIGHTS[record.type];
      if (typeFactor === void 0) return 0;
      const target = this.resolveTarget(record.target);
      const depth = this.nodeDOMDepths.get(target) ?? this.measureNodeDepth(target);
      const structuralFactor = this.computeStructuralFactor(target, depth);
      if (structuralFactor === 0) return 0;
      const sizeFactor = this.computeHTMLDeltaFactor(record, depth);
      return structuralFactor * sizeFactor * typeFactor;
    }
    pruneStaleEvents(tNow) {
      const cutoff = tNow - this.options.windowTicks * this.options.tickMs;
      let i = 0;
      while (i < this.mutationEvents.length && this.mutationEvents[i].timestamp < cutoff) {
        i++;
      }
      if (i > 0) {
        this.mutationEvents = this.mutationEvents.slice(i);
      }
    }
    computeWindowSum() {
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
      const depths = /* @__PURE__ */ new WeakMap();
      depths.set(this.options.root, 0);
      for (const node of nodes) {
        const parentDepth = depths.get(node.parentNode) ?? 0;
        depths.set(node, parentDepth + 1);
      }
      for (const node of nodes.reverse()) {
        let size = node.children.length;
        for (const child of node.children) {
          size += sizes.get(child) ?? 0;
        }
        sizes.set(node, size);
      }
      this.domDepth = 0;
      this.nodeDOMDepths = /* @__PURE__ */ new WeakMap();
      for (const node of nodes) {
        const depth = depths.get(node) ?? 0;
        this.subtreeSizes.set(node, sizes.get(node) ?? 1);
        this.nodeDOMDepths.set(node, depth);
        this.domDepth = Math.max(this.domDepth, depth);
      }
      this.totalNodeCount = nodes.length;
      this.domIntensity = nodes.reduce((sum, node) => {
        const depth = depths.get(node) ?? 0;
        return sum + this.computeStructuralFactor(node, depth);
      }, 0);
    }
    flushPendingRecords() {
      if (this.pendingMutationRecords.length === 0) return;
      const snapshot = this.pendingMutationRecords;
      this.pendingMutationRecords = [];
      if (this.hasStaleDOMMeasures) {
        this.measureDOM();
        this.hasStaleDOMMeasures = false;
      }
      const tNow = performance.now();
      for (const record of snapshot) {
        const weight = this.computeWeight(record);
        if (weight === 0) continue;
        const target = this.resolveTarget(record.target);
        const existingIndex = this.mutationEvents.findIndex((e) => e.target === target);
        if (existingIndex >= 0) {
          this.mutationEvents[existingIndex].weight = Math.max(
            this.mutationEvents[existingIndex].weight,
            weight
          );
        } else {
          this.mutationEvents.push({
            target,
            timestamp: tNow,
            weight
          });
        }
      }
    }
    tick() {
      this.flushPendingRecords();
      const now = performance.now();
      this.pruneStaleEvents(now);
      const intensity = this.computeWindowSum();
      const relativeIntensity = intensity / (this.domIntensity || 1);
      if (relativeIntensity > this.decayedIntensity) {
        this.decayedIntensity = relativeIntensity;
      } else {
        const decayProgress = Math.min(
          this.transitionTicks / CONSTRAINTS.maxDecayRampTicks,
          1
        );
        const decayFactor = 1 - decayProgress * (1 - CONSTRAINTS.intensityDecayFactor);
        this.decayedIntensity *= decayFactor;
      }
      const isAboveEntryThreshold = relativeIntensity >= this.options.threshold;
      const isAboveExitThreshold = this.decayedIntensity > CONSTRAINTS.exitThreshold;
      if (isAboveEntryThreshold && this.currentState !== "transition") {
        this.currentState = "transition";
        this.emit(this.currentState, {
          intensity: relativeIntensity
        });
      } else if (!isAboveExitThreshold && this.currentState !== "stable") {
        this.currentState = "stable";
        this.mutationEvents = [];
        this.pendingMutationRecords = [];
        this.decayedIntensity = 0;
        this.hasStaleDOMMeasures = true;
        this.emit(this.currentState, {
          intensity: relativeIntensity
        });
      } else if (this.emitOnTick) {
        this.emit("tick", {
          intensity: relativeIntensity
        });
      }
    }
    observe() {
      this.measureDOM();
      this.decayedIntensity = 1;
      this.mutationObserver = new MutationObserver((records) => {
        this.pendingMutationRecords.push(...records);
        this.hasStaleDOMMeasures = true;
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
      if (!this.mutationObserver) return this;
      this.reset();
      return this;
    }
  };

  // src/api.ts
  window.DOMQuake = DOMQuake;
})();
