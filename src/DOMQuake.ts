import { type Event, type MutationEvent, type MutationType, type DOMQuakeOptions } from "./types.ts";
import { EventEmitter } from "./EventEmitter.js";


const CONSTRAINTS: {
    exitThreshold: number;
    intensityDecayFactor: number;
    maxDecayRampTicks: number;
    maxDOMMeasureDepth: number;
    maxHTMLDeltaDepthForSampling: number;
    maxHTMLDeltaLength: number;
    skipTagNames: Set<string>;
} = {
    exitThreshold: 0.02,
    intensityDecayFactor: 0.25,
    maxDecayRampTicks: 5,
    maxDOMMeasureDepth: 32,
    maxHTMLDeltaDepthForSampling: 4,
    maxHTMLDeltaLength: 50000,
    skipTagNames: new Set([ "SCRIPT", "NOSCRIPT", "TEMPLATE", "META" ])
};

const MUTATION_WEIGHTS: {
    childList: number;
    attributes: number;
    characterData: number;
} = {
    childList: 1.0,
    attributes: 0.4,
    characterData: 0.1
};

const DEFAULT_OPTIONS: Omit<DOMQuakeOptions, "root"> = {
    threshold: 0.75,
    tickMs: 50,
    windowTicks: 6
};


export class DOMQuake extends EventEmitter<Event> {
    private readonly options: DOMQuakeOptions;
    private readonly emitOnTick: boolean;

    private subtreeSizes!: WeakMap<Node, number>;
    private nodeDOMDepths!: WeakMap<Node, number>;
    private currentState!: Event;
    private domDepth!: number;
    private domIntensity!: number | null;
    private totalNodeCount!: number;
    private decayedIntensity!: number;
    private mutationEventMap!: Map<Node, MutationEvent>;
    private pendingMutationRecords!: MutationRecord[];
    private hasStaleDOMMeasures!: boolean;
    private mutationObserver!: MutationObserver | null;
    private tickInterval!: ReturnType<typeof setInterval> | null;
    private transitionTicks!: number;

    constructor(options: Partial<DOMQuakeOptions> = {}, emitOnTick: boolean = false) {
        super();

        const optionsWithDefaults: DOMQuakeOptions = {
            ...DEFAULT_OPTIONS,

            root: window.document.documentElement,

            ...options
        };

        this.options = optionsWithDefaults;
        this.emitOnTick = emitOnTick;

        this.reset();
    }

    private reset() {
        this.mutationObserver?.disconnect();

        clearInterval(this.tickInterval ?? undefined);

        this.subtreeSizes = new WeakMap();
        this.nodeDOMDepths = new WeakMap();
        this.currentState = "transition";
        this.domDepth = 0;
        this.totalNodeCount = 0;
        this.decayedIntensity = 0;
        this.mutationEventMap = new Map();
        this.pendingMutationRecords = [];
        this.domIntensity = null;
        this.hasStaleDOMMeasures = false;
        this.mutationObserver = null;
        this.tickInterval = null;
        this.transitionTicks = CONSTRAINTS.maxDecayRampTicks;
    }

    private isSkipped(node: Node): boolean {
        return node.nodeType === Node.ELEMENT_NODE
            && CONSTRAINTS.skipTagNames.has((node as Element).tagName);
    }

    private filterSkippedNodes(nodes: NodeList | Node[]): Node[] {
        return [ ...nodes ].filter(node => !this.isSkipped(node));
    }

    private resolveTarget(node: Node): Node {
        let resolvedNode: Node = node;

        while(resolvedNode.nodeType !== Node.ELEMENT_NODE && resolvedNode.parentNode) {
            resolvedNode = resolvedNode.parentNode;
        }

        return resolvedNode;
    }

    private computeStructuralFactor(node: Node, depth: number): number {
        const subtreeSize: number | undefined = this.subtreeSizes.get(node);

        if(subtreeSize === undefined) return 0;

        const subtreeFraction: number = subtreeSize / this.totalNodeCount;
        const normalizedDepth: number = depth / (this.domDepth || depth);
        const depthFactor: number = 1 / Math.sqrt(normalizedDepth + 1);

        return subtreeFraction * depthFactor;
    }

    private computeHTMLDeltaFactor(record: MutationRecord, depth: number): number {
        const effectiveNodes: Node[] = [
            ...this.filterSkippedNodes(record.addedNodes),
            ...this.filterSkippedNodes(record.removedNodes)
        ];

        if(depth > CONSTRAINTS.maxHTMLDeltaDepthForSampling) {
            return Math.log2(effectiveNodes.length + 1) + 1;
        }

        const totalHTMLDelta: number = effectiveNodes
            .reduce((sum: number, node: Node) => {
                const html: string = (node as Element).outerHTML ?? node.textContent ?? "";
                const htmlSize: number = Math.min(html.length, CONSTRAINTS.maxHTMLDeltaLength);

                return sum + htmlSize;
            }, 0);

        return Math.log2(totalHTMLDelta + 1) + 1;
    }

    private computeWeight(record: MutationRecord): number {
        const typeFactor: number | undefined = MUTATION_WEIGHTS[record.type as MutationType];

        if(typeFactor === undefined) return 0;

        const target: Node = this.resolveTarget(record.target);

        if(this.isSkipped(target)) return 0;

        const depth: number = this.nodeDOMDepths.get(target) ?? this.measureNodeDepth(target);
        const structuralFactor: number = this.computeStructuralFactor(target, depth);

        if(structuralFactor === 0) return 0;

        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);

        return structuralFactor * sizeFactor * typeFactor;
    }

    private pruneStaleEvents(tNow: number): void {
        const cutoff: number = tNow - (this.options.windowTicks * this.options.tickMs);

        for(const [ target, event ] of this.mutationEventMap) {
            if(event.timestamp < cutoff) {
                this.mutationEventMap.delete(target);
            }
        }
    }

    private computeWindowSum(): number {
        let sum: number = 0;

        for(const event of this.mutationEventMap.values()) {
            sum += event.weight;
        }

        return sum;
    }

    private measureNodeDepth(node: Node): number {
        let depth: number = 0;
        let current: Node = node;

        while(current.parentNode && depth < CONSTRAINTS.maxDOMMeasureDepth) {
            current = current.parentNode;

            depth++;
        }

        return depth;
    }

    private measureDOM() {
        const nodes: Element[] = [ ...this.options.root.querySelectorAll("*") ];
        const sizes: WeakMap<Node, number> = new WeakMap();
        const depths: WeakMap<Node, number> = new WeakMap();

        depths.set(this.options.root, 0);

        for(const node of nodes) {
            const parentDepth: number = depths.get(node.parentNode!) ?? 0;
            depths.set(node, parentDepth + 1);
        }

        for(const node of nodes.reverse()) {
            let size: number = node.children.length;

            for(const child of node.children) {
                size += sizes.get(child) ?? 0;
            }

            sizes.set(node, size);
        }

        this.domDepth = 0;
        this.subtreeSizes = new WeakMap();
        this.nodeDOMDepths = new WeakMap();

        for(const node of nodes) {
            const depth: number = depths.get(node) ?? 0;

            this.subtreeSizes.set(node, sizes.get(node) ?? 1);
            this.nodeDOMDepths.set(node, depth);
            this.domDepth = Math.max(this.domDepth, depth);
        }

        this.totalNodeCount = nodes.length;
        this.domIntensity = nodes.reduce((sum: number, node: Element) => {
            const depth: number = depths.get(node) ?? 0;

            return sum + this.computeStructuralFactor(node, depth);
        }, 0);
    }

    private flushPendingRecords(): void {
        if(this.pendingMutationRecords.length === 0) return;

        const snapshot: MutationRecord[] = this.pendingMutationRecords;

        this.pendingMutationRecords = [];

        if(this.hasStaleDOMMeasures) {
            this.measureDOM();
            this.hasStaleDOMMeasures = false;
        }

        const tNow: number = performance.now();
        let hadSignificantMutation: boolean = false;

        for(const record of snapshot) {
            const weight: number = this.computeWeight(record);

            if(weight === 0) continue;

            hadSignificantMutation = true;

            const target: Node = this.resolveTarget(record.target);

            const existing: MutationEvent | undefined = this.mutationEventMap.get(target);

            if(existing !== undefined) {
                existing.weight = Math.max(existing.weight, weight);
            } else {
                this.mutationEventMap.set(target, {
                    target,
                    timestamp: tNow,
                    weight
                });
            }
        }

        if(hadSignificantMutation) {
            this.hasStaleDOMMeasures = true;
        }
    }

    private tick() {
        this.flushPendingRecords();

        const now: number = performance.now();

        this.pruneStaleEvents(now);

        const intensity: number = this.computeWindowSum();
        const relativeIntensity: number = intensity / (this.domIntensity || 1);

        if(relativeIntensity > this.decayedIntensity) {
            this.decayedIntensity = relativeIntensity;
            this.transitionTicks = 0;
        } else {
            this.transitionTicks = Math.min(
                this.transitionTicks + 1,
                CONSTRAINTS.maxDecayRampTicks
            );

            const decayProgress: number = this.transitionTicks / CONSTRAINTS.maxDecayRampTicks;
            const decayFactor: number = 1.0 - (decayProgress * (1.0 - CONSTRAINTS.intensityDecayFactor));

            this.decayedIntensity *= decayFactor;
        }

        const isAboveEntryThreshold: boolean = (relativeIntensity >= this.options.threshold);
        const isAboveExitThreshold: boolean = (this.decayedIntensity > CONSTRAINTS.exitThreshold);

        if(isAboveEntryThreshold && this.currentState !== "transition") {
            this.currentState = "transition";

            this.emit(this.currentState, {
                intensity: relativeIntensity
            });

        } else if(!isAboveExitThreshold && this.currentState !== "stable") {
            this.currentState = "stable";
            this.mutationEventMap = new Map();
            this.pendingMutationRecords = [];
            this.decayedIntensity = 0;
            this.hasStaleDOMMeasures = true;

            this.emit(this.currentState, {
                intensity: relativeIntensity
            });

        } else if(this.emitOnTick) {
            this.emit("tick" as Event, {
                intensity: relativeIntensity
            });
        }
    }

    public observe(): this {
        this.measureDOM();

        this.decayedIntensity = 1.0;

        this.mutationObserver = new MutationObserver((records: MutationRecord[]) => {
            this.pendingMutationRecords.push(...records);
        });

        this.mutationObserver
            .observe(this.options.root, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
            });

        this.tick();

        this.tickInterval = setInterval(() => this.tick(), this.options.tickMs);

        return this;
    }

    public disconnect(): this {
        if(!this.mutationObserver) return this;

        this.reset();

        return this;
    }
}