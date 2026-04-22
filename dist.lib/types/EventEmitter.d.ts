declare const WILDCARD_EVENT_NAME: "*";
type Event<T> = T | typeof WILDCARD_EVENT_NAME;
type ListenerCb = (...args: unknown[]) => void;
export declare class EventEmitter<T> {
    private readonly listeners;
    private getListeners;
    on(event: Event<T>, listener: ListenerCb): this;
    once(event: Event<T>, listener: ListenerCb): this;
    off(event: Event<T>, listener: ListenerCb): this;
    emit<A = unknown>(event: T, arg?: A): void;
}
export {};
