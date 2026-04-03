import { type EventArgument } from "./types.ts";


type ListenerCb = (...args: unknown[]) => void;
type ListenerMap<T> = Map<T, ListenerCb[]>;


export class EventEmitter<T> {
    private readonly listeners: {
        on: ListenerMap<T>;
        once: ListenerMap<T>;
    } = {
        on: new Map<T, ListenerCb[]>(),
        once: new Map<T, ListenerCb[]>(),
    };

    private getListeners(listenerMap: ListenerMap<T>, event: T): ListenerCb[] {
        !listenerMap.has(event)
            && listenerMap.set(event, []);

        return listenerMap.get(event)!;
    }

    public on(event: T, listener: ListenerCb): this {
        this.getListeners(this.listeners.on, event)
            .push(listener);

        return this;
    }

    public once(event: T, listener: ListenerCb): this {
        this.getListeners(this.listeners.once, event)
            .push(listener);

        return this;
    }

    public emit<A = EventArgument>(event: T, arg: A) {
        this.getListeners(this.listeners.once, event)
            .forEach((listener: ListenerCb) => listener(arg));
        this.getListeners(this.listeners.on, event)
            .forEach((listener: ListenerCb) => listener(arg));

        this.listeners.once.set(event, []);
    }
}