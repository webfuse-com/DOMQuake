import { type Event } from "./types.ts";
import { EventEmitter } from "./EventEmitter.js";


type MutationType =
    | "childList"
    | "attributes"
    | "characterData";


interface DOMQuakeOptions {
    quiescenceTicks: number;
    root: Element;
    threshold: number;
    tickMs: number;
    windowTicks: number;
}

interface MutationEvent {
    timestamp: number;
    weight: number;
}

const CONSTRAINTS: {
    htmlDelta: {
        maxDepthForSampling: number;
        maxHTMLLength: number;
        significantInjectionChars: number
    };
    maxDOMMeasureDepth: number;
} = {
    htmlDelta: {
        maxDepthForSampling: 4,
        maxHTMLLength: 50000,
        significantInjectionChars: 1000
    },
    maxDOMMeasureDepth: 32
};

const WEIGHTS: {
    mutationTypeFactors: Record<MutationType, number>
} = {
    mutationTypeFactors: {
        childList: 1.0,
        attributes: 0.4,
        characterData: 0.1
    }
};

const DEFAULT_OPTIONS: Omit<DOMQuakeOptions, "root"> = {
    quiescenceTicks: 3,
    threshold: 0.5,
    tickMs: 50,
    windowTicks: 6
};


export class DOMQuake extends EventEmitter<Event> {
    private readonly options: DOMQuakeOptions;
    private readonly emitOnTick: boolean;

    private subtreeSizes!: WeakMap<Node, number>;
    private currentState!: Event;
    private domDepth!: number;
    private domIntensity!: number | null;
    private totalNodeCount!: number;
    private idleInTransitionTicks!: number;
    private mutationEvents!: MutationEvent[];
    private pendingMutationRecords!: MutationRecord[];
    private hasStaleDOMMeasures!: boolean;
    private mutationObserver!: MutationObserver | null;
    private tickInterval!: ReturnType<typeof setInterval> | null;

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

    private computeStructuralFactor(node: Node, depth: number): number {
        const subtreeSize: number | undefined = this.subtreeSizes.get(node);

        if(subtreeSize === undefined) return 0;

        const subtreeFraction: number = subtreeSize / this.totalNodeCount;
        const normalizedDepth: number = depth / (this.domDepth || depth);
        const depthFactor: number = 1 / Math.sqrt(normalizedDepth + 1);

        return subtreeFraction * depthFactor;
    }

    private computeHTMLDeltaFactor(record: MutationRecord, depth: number): number {
        if(depth > CONSTRAINTS.htmlDelta.maxDepthForSampling) {
            const nodeCount: number = record.addedNodes.length + record.removedNodes.length;

            return Math.log2(nodeCount + 1) + 1;
        }

        const affectedNodes: Node[] = [
            ...Array.from(record.addedNodes),
            ...Array.from(record.removedNodes)
        ];

        const totalHtmlDelta: number = affectedNodes
            .reduce((sum: number, node: Node) => {
                const html: string = (node as Element).outerHTML ?? node.textContent ?? "";
                const htmlSize: number = Math.min(html.length, CONSTRAINTS.htmlDelta.maxHTMLLength);

                return sum + htmlSize;
            }, 0);

        if(totalHtmlDelta >= CONSTRAINTS.htmlDelta.significantInjectionChars) {
            this.measureDOM();
        }

        return Math.log2(totalHtmlDelta + 1) + 1;
    }

    private computeWeight(record: MutationRecord): number {
        const typeFactor: number | undefined = WEIGHTS.mutationTypeFactors[record.type as MutationType];

        if(typeFactor === undefined) return 0;

        const depth: number = this.measureNodeDepth(record.target);

        const structuralFactor: number = this.computeStructuralFactor(record.target, depth);

        if(structuralFactor === 0) return 0;

        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);

        return structuralFactor * sizeFactor * typeFactor;
    }

    private computeWindowSum(tNow: number): number {
        const cutoff: number = tNow - (this.options.windowTicks * this.options.tickMs);

        let i: number = 0;

        while((i < this.mutationEvents.length) && (this.mutationEvents[i].timestamp < cutoff)) {
            i++;
        }

        if(i > 0) {
            this.mutationEvents = this.mutationEvents.slice(i);
        }

        return this.mutationEvents
            .reduce((sum: number, event: MutationEvent) => sum + event.weight, 0);
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

        for(const node of nodes.reverse()) {
            let size: number = node.children.length;

            for(const child of node.children) {
                size += sizes.get(child) ?? 0;
            }

            sizes.set(node, size);
        }

        this.domDepth = 0;

        for(const node of nodes) {
            this.subtreeSizes.set(node, sizes.get(node) ?? 1);
            this.domDepth = Math.max(this.domDepth, this.measureNodeDepth(node));
        }

        this.totalNodeCount = nodes.length;
        this.domIntensity = nodes.reduce((sum: number, node: Element) => {
            const depth: number = this.measureNodeDepth(node);

            return sum + this.computeStructuralFactor(node, depth);
        }, 0);
    }

    private flushPendingRecords(): void {
        if(this.pendingMutationRecords.length === 0) return;

        if(this.hasStaleDOMMeasures) {
            const snapshot: MutationRecord[] = this.pendingMutationRecords;

            this.pendingMutationRecords = [];

            this.measureDOM();

            this.pendingMutationRecords = snapshot;
            this.hasStaleDOMMeasures = false;
        }

        const tNow: number = performance.now();

        for(const record of this.pendingMutationRecords) {
            const weight: number = this.computeWeight(record);

            if(weight === 0) continue;

            this.mutationEvents.push({
                timestamp: tNow,
                weight
            });
        }

        this.pendingMutationRecords = [];
    }

    private tick() {
        this.flushPendingRecords();

        const now: number = performance.now();
        const intensity: number = this.computeWindowSum(now);
        const relativeIntensity: number = intensity / (this.domIntensity ?? 1);

        const isAboveThreshold: boolean = (relativeIntensity >= this.options.threshold);

        if (
            (isAboveThreshold && this.currentState === "transition") ||
            (!isAboveThreshold && this.currentState === "idle")
        ) {
            this.emitOnTick
                && this.emit("tick", {
                    intensity: relativeIntensity
                });

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

    public observe(): this {
        this.measureDOM();

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
        this.reset();

        return this;
    }
}