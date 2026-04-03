import { EventArgument } from "./types.js";
import { UIShiftObserver } from "./UIShiftObserver.js";


export class DOMQuake extends UIShiftObserver {
    public observe(): this {
        super.observe();

        window.addEventListener("load", () => this.emit<
            EventArgument & { native: boolean; }
        >("idle", {
            intensity: 1,
            native: true
        }));

        return this;
    }
}