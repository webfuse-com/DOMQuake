import { type EventArgument } from "./types.ts";


const WILDCARD_EVENT_NAME = "*" as const;


type Event<T> = T | typeof WILDCARD_EVENT_NAME;
type ListenerCb = (...args: unknown[]) => void;
type ListenerMap<T> = Map<Event<T>, ListenerCb[]>;


export class EventEmitter<T> {
    private readonly listeners: {
        on: ListenerMap<T>;
        once: ListenerMap<T>;
    } = {
        on: new Map<T, ListenerCb[]>(),
        once: new Map<T, ListenerCb[]>(),
    };

    private getListeners(listenerMap: ListenerMap<T>, event: Event<T>): ListenerCb[] {
        !listenerMap.has(event) && listenerMap.set(event, []);

        return listenerMap.get(event)!;
    }

    public on(event: Event<T>, listener: ListenerCb): this {
        this.getListeners(this.listeners.on, event)
            .push(listener);

        return this;
    }

    public once(event: Event<T>, listener: ListenerCb): this {
        this.getListeners(this.listeners.once, event)
            .push(listener);

        return this;
    }

    public emit<A = EventArgument>(event: T, arg: A) {
        this.getListeners(this.listeners.once, event)
            .forEach((listener: ListenerCb) => listener(arg));
        this.getListeners(this.listeners.once, WILDCARD_EVENT_NAME)
            .forEach((listener: ListenerCb) => listener(event, arg));
        this.getListeners(this.listeners.on, event)
            .forEach((listener: ListenerCb) => listener(arg));
        this.getListeners(this.listeners.on, WILDCARD_EVENT_NAME)
            .forEach((listener: ListenerCb) => listener(event, arg));

        this.listeners.once.set(event, []);
        this.listeners.once.set(WILDCARD_EVENT_NAME, []);
    }
}