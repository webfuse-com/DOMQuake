import { Event, EventEmitter } from "./EventEmitter.js";


interface DOMQuakeOptions {
    minTransitionDurationMs: number;
    threshold: number;
    windowMs: number;
}

interface MutationEvent {
    timestamp: number;
    weight: number;
}

interface IntensityEventArgument {
    intensity: number;
}


const DEFAULT_OPTIONS: DOMQuakeOptions = {
    minTransitionDurationMs: 200,
    threshold: 2.0,
    windowMs: 300
};

const WEIGHTS = {
    typeFactors: {
        childList: 1.0,
        attributes: 0.4,
        characterData: 0.1,
    },
    maxDepth: 8,
    htmlDelta: {
        maxDepthForSampling: 4,
        maxHtmlLength: 50_000,
    },
};


export class DOMQuake extends EventEmitter {
    private readonly mutationEvents: MutationEvent[] = [];
    private readonly root: Element;
    private readonly options: DOMQuakeOptions;

    private currentState: Event = "idle";
    private transitionStartMs: number | null = null;

    constructor(root: Element = document.documentElement, options: Partial<DOMQuakeOptions> = {}) {
        super();

        const optionsWithDefaults: DOMQuakeOptions = {
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

    private weight(record: MutationRecord): number {
        const depth: number = this.measureNodeDepth(record.target);

        const computeDepthFactor: number = this.computeDepthFactor(depth);
        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);
        const typeFactor: number = WEIGHTS.typeFactors[record.type] ?? 0.1;

        return computeDepthFactor * sizeFactor * typeFactor;
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
        const now: number = performance.now();
        const intensity: number = this.computeWindowSum(now);

        if(intensity >= this.options.threshold) {
            if(this.currentState !== "idle") return;

            this.currentState = "transition";
            this.transitionStartMs = now;
        } else {
            if(this.currentState !== "transition") return;

            const elapsedMs: number = now - (this.transitionStartMs ?? now);
            if(elapsedMs < this.options.minTransitionDurationMs) return;

            this.currentState = "idle";
            this.transitionStartMs = null;
        }

        this.emit<IntensityEventArgument>(this.currentState, {
            intensity
        });
    }
}