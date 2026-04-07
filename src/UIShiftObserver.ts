import { type Event } from "./types.ts";
import { EventEmitter } from "./EventEmitter.js";


type MutationType =
    | "childList"
    | "attributes"
    | "characterData";


interface UIShiftObserverOptions {
    minTransitionDurationMs: number;
    threshold: number;
    tickIntervalMs: number;
    windowMs: number;
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

const DEFAULT_OPTIONS: UIShiftObserverOptions = {
    minTransitionDurationMs: 200,
    threshold: 0.5,
    tickIntervalMs: 50,
    windowMs: 300
};


export class UIShiftObserver extends EventEmitter<Event> {
    private readonly root: Element;
    private readonly options: UIShiftObserverOptions;

    private subtreeSizes!: WeakMap<Node, number>; // O(1)
    private totalNodeCount!: number;
    private mutationEvents!: MutationEvent[];
    private maxPageIntensity!: number | null;
    private currentState!: Event | null;
    private transitionStartTimestamp!: number | null;
    private mutationObserver!: MutationObserver | null;
    private tickInterval!: ReturnType<typeof setInterval> | null;

    constructor(root: Element = document.documentElement, options: Partial<UIShiftObserverOptions> = {}) {
        super();

        const optionsWithDefaults: UIShiftObserverOptions = {
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
        this.totalNodeCount = 0;
        this.mutationEvents = [];
        this.maxPageIntensity = null;
        this.currentState = null;
        this.transitionStartTimestamp = null;
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
        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);

        return structuralFactor * sizeFactor * typeFactor;
    }

    private computeWindowSum(tNow: number): number {
        const cutoff: number = tNow - this.options.windowMs;

        while(this.mutationEvents.length > 0 && this.mutationEvents[0].timestamp < cutoff) {
            this.mutationEvents.shift();
        }

        return this.mutationEvents
            .reduce((sum: number, event: MutationEvent) => sum + event.weight, 0);
    }

    private raiseGroundTruth() {
        const referenceNodes: Element[] = [ ...this.root.querySelectorAll("*") ];

        for(const node of referenceNodes) {
            const subtreeSize: number = node.querySelectorAll("*").length + 1;

            this.subtreeSizes.set(node, subtreeSize);
        }

        this.totalNodeCount = referenceNodes.length;

        this.maxPageIntensity = referenceNodes
            .reduce((sum: number, node: Element) => {
                const depth: number = this.measureNodeDepth(node);
                const structuralFactor: number = this.computeStructuralFactor(node, depth);

                return sum + structuralFactor;
            }, 0);
    }

    private tick() {
        const tNow: number = performance.now();
        const intensity: number = this.computeWindowSum(tNow);
        const relativeIntensity: number = intensity / (this.maxPageIntensity ?? 1);

        if(relativeIntensity >= this.options.threshold) {
            if((this.currentState ?? "idle") !== "idle") return;

            this.currentState = "transition";
            this.transitionStartTimestamp = tNow;
        } else {
            if(this.currentState !== "transition") return;

            const elapsedMs: number = tNow - (this.transitionStartTimestamp ?? tNow);
            if(elapsedMs < this.options.minTransitionDurationMs) return;

            this.currentState = "idle";
            this.transitionStartTimestamp = null;
        }

        this.emit(this.currentState, {
            intensity: relativeIntensity
        });
    }

    public observe(): this {
        this.raiseGroundTruth();

        this.mutationObserver = new MutationObserver((records: MutationRecord[]) => {
            const now: number = performance.now();

            for(const record of records) {
                this.mutationEvents.push({
                    timestamp: now,
                    weight: this.computeWeight(record)
                });
            }
        });

        this.mutationObserver
            .observe(this.root, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
            });

        this.tickInterval = setInterval(() => this.tick(), this.options.tickIntervalMs);

        return this;
    }

    public disconnect(): this {
        this.reset();

        return this;
    }
}