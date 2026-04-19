export type Event = "tick" | "stable" | "transition";
export type MutationType = "childList" | "attributes" | "characterData";
export interface EventArgument {
    intensity: number;
}
export interface DOMQuakeOptions {
    root: Element;
    threshold: number;
    tickMs: number;
    windowTicks: number;
}
export interface MutationEvent {
    target: Node;
    timestamp: number;
    weight: number;
}
