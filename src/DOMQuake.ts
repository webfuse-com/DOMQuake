import { EventArgument } from "./types.js";
import { UIShiftObserver } from "./UIShiftObserver.js";


export class DOMQuake extends UIShiftObserver {
    public observe(): this {
        super.observe();

        return this;
    }
}