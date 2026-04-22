const WILDCARD_EVENT_NAME = "*" as const;


type Event<T> = T | typeof WILDCARD_EVENT_NAME;
type ListenerCb = (...args: unknown[]) => void;
type ListenerMap<T> = Map<Event<T>, Set<ListenerCb>>;


export class EventEmitter<T> {
    private readonly listeners: {
        on: ListenerMap<T>;
        once: ListenerMap<T>;
    } = {
        on: new Map(),
        once: new Map(),
    };

    private getListeners(listenerMap: ListenerMap<T>, event: Event<T>): Set<ListenerCb> {
        !listenerMap.has(event) && listenerMap.set(event, new Set());

        return listenerMap.get(event)!;
    }

    public on(event: Event<T>, listener: ListenerCb): this {
        this.getListeners(this.listeners.on, event)
            .add(listener);

        return this;
    }

    public once(event: Event<T>, listener: ListenerCb): this {
        this.getListeners(this.listeners.once, event)
            .add(listener);

        return this;
    }

    public off(event: Event<T>, listener: ListenerCb): this {
        this.getListeners(this.listeners.on, event)
            .delete(listener)
        this.getListeners(this.listeners.once, event)
            .delete(listener)

        return this;
    }

    public emit<A = unknown>(event: T, arg?: A) {
        [ ...this.getListeners(this.listeners.once, event) ]
            .forEach((listener: ListenerCb) => listener(arg));
        [ ...this.getListeners(this.listeners.once, WILDCARD_EVENT_NAME) ]
            .forEach((listener: ListenerCb) => listener(event, arg));
        [ ...this.getListeners(this.listeners.on, event) ]
            .forEach((listener: ListenerCb) => listener(arg));
        [ ...this.getListeners(this.listeners.on, WILDCARD_EVENT_NAME) ]
            .forEach((listener: ListenerCb) => listener(event, arg));

        this.listeners.once.set(event, new Set());
        this.listeners.once.set(WILDCARD_EVENT_NAME, new Set());
    }
}