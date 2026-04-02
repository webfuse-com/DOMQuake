type ListenerCb = (...args: unknown[]) => void;
type ListenerMap = Map<Event, ListenerCb[]>;

export type Event =
    | 'idle'
    | 'transition';


export class EventEmitter {
    private readonly listeners: {
        on: ListenerMap;
        once: ListenerMap;
    } = {
        on: new Map<Event, ListenerCb[]>(),
        once: new Map<Event, ListenerCb[]>(),
    };

    private getListeners(listenerMap: ListenerMap, event: Event): ListenerCb[] {
        !listenerMap.has(event)
            && listenerMap.set(event, []);

        return listenerMap.get(event)!;
    }

    public on(event: Event, listener: ListenerCb): this {
        this.getListeners(this.listeners.on, event)
            .push(listener);

        return this;
    }

    public once(event: Event, listener: ListenerCb): this {
        this.getListeners(this.listeners.once, event)
            .push(listener);

        return this;
    }

    public emit<T>(event: Event, arg: T) {
        this.getListeners(this.listeners.once, event)
            .forEach((listener: ListenerCb) => listener(arg));
        this.getListeners(this.listeners.on, event)
            .forEach((listener: ListenerCb) => listener(arg));

        this.listeners.once.set(event, []);
    }
}