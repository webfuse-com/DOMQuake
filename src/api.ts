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