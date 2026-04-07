export type Event =
    | "idle"
    | "transition";

export interface EventArgument {
    intensity: number;
}