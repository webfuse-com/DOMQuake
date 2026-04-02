type Event =
    | 'idle'
    | 'transition';
type ListenerCb = (...args: unknown[]) => void;
type ListenerMap = Map<Event, ListenerCb[]>;


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

    public on(event: Event, listener: ListenerCb) {
        this.getListeners(this.listeners.on, event)
            .push(listener);
    }

    public once(event: Event, listener: ListenerCb) {
        this.getListeners(this.listeners.once, event)
            .push(listener);
    }

    public emit(event: Event, ...args: unknown[]) {
        this.getListeners(this.listeners.once, event)
            .forEach((listener: ListenerCb) => listener(...args));
        this.getListeners(this.listeners.on, event)
            .forEach((listener: ListenerCb) => listener(...args));

        this.listeners.once.set(event, []);
    }
}