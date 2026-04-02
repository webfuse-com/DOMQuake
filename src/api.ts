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

    
}