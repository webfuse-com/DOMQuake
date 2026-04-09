import { type Event } from "./types.ts";
import { EventEmitter } from "./EventEmitter.js";


type MutationType =
    | "childList"
    | "attributes"
    | "characterData";


interface DOMQuakeOptions {
    minIdleInTransitionTicks: number;
    threshold: number;
    tickMs: number;
    windowTicks: number;
}

interface MutationEvent {
    timestamp: number;
    weight: number;
}

const WEIGHTS: {
    htmlDelta: {
        maxDepthForSampling: number;
        maxHtmlLength: number
    };
    maxDepth: number;
    typeFactors: Record<MutationType, number>
} = {
    htmlDelta: {
        maxDepthForSampling: 4,
        maxHtmlLength: 50000
    },
    maxDepth: 8,
    typeFactors: {
        childList: 1.0,
        attributes: 0.4,
        characterData: 0.1
    }
};

const DEFAULT_OPTIONS: DOMQuakeOptions = {
    minIdleInTransitionTicks: 3,
    threshold: 0.5,
    tickMs: 50,
    windowTicks: 6
};


export class DOMQuake extends EventEmitter<Event> {
    private readonly root: Element;
    private readonly options: DOMQuakeOptions;

    private subtreeSizes!: WeakMap<Node, number>; // O(1)
    private currentState!: Event;
    private totalNodeCount!: number;
    private idleInTransitionTicks!: number;
    private mutationEvents!: MutationEvent[];
    private pendingMutationRecords!: MutationRecord[];
    private maxPageIntensity!: number | null;
    private mutationObserver!: MutationObserver | null;
    private tickInterval!: ReturnType<typeof setInterval> | null;

    constructor(root: Element = document.documentElement, options: Partial<DOMQuakeOptions> = {}) {
        super();

        const optionsWithDefaults: DOMQuakeOptions = {
            ...DEFAULT_OPTIONS,
            ...options
        };

        this.root = root;
        this.options = optionsWithDefaults;

        this.reset();
    }

    private reset() {
        this.mutationObserver?.disconnect();

        clearInterval(this.tickInterval ?? undefined);

        this.subtreeSizes = new WeakMap();
        this.currentState = "transition";
        this.totalNodeCount = 0;
        this.idleInTransitionTicks = 0;
        this.mutationEvents = [];
        this.pendingMutationRecords = [];
        this.maxPageIntensity = null;
        this.mutationObserver = null;
        this.tickInterval = null;
    }

    private measureNodeDepth(node: Node): number {
        let depth: number = 0;
        let current: Node = node;

        while(current.parentNode && depth < WEIGHTS.maxDepth) {
            current = current.parentNode;

            depth++;
        }

        return depth;
    }

    private computeDepthFactor(depth: number): number {
        return 1 / Math.sqrt(depth + 1);
    }

    private computeStructuralFactor(node: Node, depth: number): number {
        const subtreeSize: number | undefined = this.subtreeSizes.get(node);

        if(subtreeSize === undefined) return 0;

        const subtreeFraction: number = subtreeSize / this.totalNodeCount;
        const depthFactor: number = this.computeDepthFactor(depth);

        return subtreeFraction * depthFactor;
    }

    private computeHTMLDeltaFactor(record: MutationRecord, depth: number): number {
        if(depth > WEIGHTS.htmlDelta.maxDepthForSampling) {
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
                const htmlSize: number = Math.min(html.length, WEIGHTS.htmlDelta.maxHtmlLength);

                return sum + htmlSize;
            }, 0);

        return Math.log2(totalHtmlDelta + 1) + 1;
    }

    private computeWeight(record: MutationRecord): number {
        const typeFactor: number | undefined = WEIGHTS.typeFactors[record.type as MutationType];

        if(typeFactor === undefined) return 0;

        const depth: number = this.measureNodeDepth(record.target);

        const structuralFactor: number = this.computeStructuralFactor(record.target, depth);

        if(structuralFactor === 0) return 0;

        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);

        return structuralFactor * sizeFactor * typeFactor;
    }

    private flushPendingRecords(): void {
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

    private computeWindowSum(tNow: number): number {
        const cutoff: number = tNow - (this.options.windowTicks * this.options.tickMs);

        let i = 0;
        while (i < this.mutationEvents.length && this.mutationEvents[i].timestamp < cutoff) {
            i++;
        }

        if (i > 0) {
            this.mutationEvents = this.mutationEvents.slice(i);
        }

        return this.mutationEvents
            .reduce((sum: number, event: MutationEvent) => sum + event.weight, 0);
    }

    private raiseGroundTruth() {
        const nodes = [...this.root.querySelectorAll("*")];
        const sizes = new WeakMap<Node, number>();

        for(const node of nodes.reverse()) {
            let size = node.children.length;

            for(const child of node.children) {
                size += sizes.get(child) ?? 0;
            }

            sizes.set(node, size);
        }

        for(const node of nodes) {
            this.subtreeSizes.set(node, sizes.get(node) ?? 1);
        }

        this.totalNodeCount = nodes.length;

        this.maxPageIntensity = nodes.reduce((sum, node) => {
            const depth = this.measureNodeDepth(node);

            return sum + this.computeStructuralFactor(node, depth);
        }, 0);
    }

    private tick() {
        this.flushPendingRecords();

        const tNow: number = performance.now();
        const intensity: number = this.computeWindowSum(tNow);
        const relativeIntensity: number = intensity / (this.maxPageIntensity ?? 1);

        if(relativeIntensity >= this.options.threshold) {
            if(this.currentState === "transition") return;

            this.idleInTransitionTicks = 0;

            this.currentState = "transition";
        } else {
            if(this.currentState === "idle") return;

            this.idleInTransitionTicks++;

            if(this.idleInTransitionTicks < this.options.minIdleInTransitionTicks) return;

            this.currentState = "idle";
            this.mutationEvents = [];

            this.raiseGroundTruth();
        }

        this.emit(this.currentState, {
            intensity: relativeIntensity
        });
    }

    public observe(): this {
        this.raiseGroundTruth();

        this.mutationObserver = new MutationObserver((records: MutationRecord[]) => {
            this.pendingMutationRecords.push(...records);
        });

        this.mutationObserver
            .observe(this.root, {
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