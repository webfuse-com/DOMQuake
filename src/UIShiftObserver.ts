import { Event } from "./types.js";
import { EventEmitter } from "./EventEmitter.js";


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
    htmlDelta: Record<string, number>
    maxDepth: number;
    typeFactors: Record<string, number>;
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
    threshold: 2.0,
    tickIntervalMs: 50,
    windowMs: 300
};


export class UIShiftObserver extends EventEmitter<Event> {
    private readonly root: Element;
    private readonly options: UIShiftObserverOptions;

    private mutationEvents: MutationEvent[] = [];
    private currentState: Event = "idle";
    private transitionStartTimestamp: number | null = null;
    private mutationObserver: MutationObserver | null = null;
    private tickInterval: ReturnType<typeof setInterval> | null = null;

    constructor(root: Element = document.documentElement, options: Partial<UIShiftObserverOptions> = {}) {
        super();

        const optionsWithDefaults: UIShiftObserverOptions = {
            ...DEFAULT_OPTIONS,
            ...options
        };

        this.root = root;
        this.options = optionsWithDefaults;
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
        const depth: number = this.measureNodeDepth(record.target);

        const depthFactor: number = this.computeDepthFactor(depth);
        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);
        const typeFactor: number = WEIGHTS.typeFactors[record.type] ?? 0.1;

        return depthFactor * sizeFactor * typeFactor;
    }

    private computeWindowSum(tNow: number): number {
        const cutoff: number = tNow - this.options.windowMs;

        while(this.mutationEvents.length > 0 && this.mutationEvents[0].timestamp < cutoff) {
            this.mutationEvents.shift();
        }

        return this.mutationEvents
            .reduce((sum: number, event: MutationEvent) => sum + event.weight, 0);
    }

    private tick(): void {
        const tNow: number = performance.now();
        const intensity: number = this.computeWindowSum(tNow);

        if(intensity >= this.options.threshold) {
            if(this.currentState !== "idle") return;

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
            intensity
        });
    }

    public observe(): this {
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
        this.mutationObserver?.disconnect();

        clearInterval(this.tickInterval!);

        this.currentState = "idle";
        this.mutationEvents = [];
        this.mutationObserver = null;
        this.tickInterval = null;
        this.transitionStartTimestamp = null;

        return this;
    }
}