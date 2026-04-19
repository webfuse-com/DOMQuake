import { DOMQuake } from "./DOMQuake.js";
declare global {
    interface Window {
        DOMQuake: typeof DOMQuake;
    }
}
