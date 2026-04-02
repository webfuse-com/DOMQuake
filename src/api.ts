interface DOMQuakeOptions {
    windowMs: number;
    threshold: number;
    quiescenceMs: number;
}


const DEFAULT_OPTIONS: DOMQuakeOptions = {
    windowMs: 300,
    threshold: 2.0,
    quiescenceMs: 200,
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


export class DOMQuake {
    private readonly root: Element;
    private readonly options: {
        windowMs: number;
        threshold: number;
        quiescenceMs: number;
    };

    constructor(root: Element = document.documentElement, options: Partial<DOMQuakeOptions> = {}) {
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

        while (current.parentNode && depth < WEIGHTS.maxDepth) {
            current = current.parentNode;
            depth++;
        }

        return depth;
    }

    private computeDepthFactor(depth: number): number {
        return 1 / Math.sqrt(depth + 1);
    }

    private computeHTMLDeltaFactor(record: MutationRecord, depth: number): number {
        const shouldSample: boolean = depth <= WEIGHTS.htmlDelta.maxDepthForSampling;

        if (shouldSample) {
            const affectedNodes: Node[] = [
                ...Array.from(record.addedNodes),
                ...Array.from(record.removedNodes),
            ];

            const totalHtmlDelta: number = affectedNodes.reduce(
                (sum: number, node: Node) => {
                    const html: string = (node as Element).outerHTML ?? node.textContent ?? "";
                    const htmlSize: number = Math.min(html.length, WEIGHTS.htmlDelta.maxHtmlLength);

                    return sum + htmlSize;
                },
                0
            );

            return Math.log2(totalHtmlDelta + 1) + 1;
        }

        const nodeCount: number = record.addedNodes.length + record.removedNodes.length;

        return Math.log2(nodeCount + 1) + 1;
    }

    private weight(record: MutationRecord): number {
        const depth: number = this.measureNodeDepth(record.target);

        const computeDepthFactor: number = this.computeDepthFactor(depth);
        const sizeFactor: number = this.computeHTMLDeltaFactor(record, depth);
        const typeFactor: number = WEIGHTS.typeFactors[record.type] ?? 0.1;

        return computeDepthFactor * sizeFactor * typeFactor;
    }
}