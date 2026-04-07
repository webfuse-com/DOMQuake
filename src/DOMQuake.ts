import { type EventArgument } from "./types.ts";
import { UIShiftObserver } from "./UIShiftObserver.js";


export class DOMQuake extends UIShiftObserver {
    public observe(): this {
        super.observe();

        window.addEventListener("load", () => this.emit<
            EventArgument & { native: boolean; }
        >("idle", {
            intensity: Infinity,
            native: true
        }));

        return this;
    }
}