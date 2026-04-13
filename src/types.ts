export type Event =
    | "tick"
    | "stable"
    | "transition";

export interface EventArgument {
    intensity: number;
}