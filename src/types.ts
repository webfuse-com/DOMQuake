export type Event =
    | "tick"
    | "idle"
    | "transition";

export interface EventArgument {
    intensity: number;
}