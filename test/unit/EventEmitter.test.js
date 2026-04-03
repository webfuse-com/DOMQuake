import { EventEmitter } from "../../src/EventEmitter.ts";


const eventEmitter = new EventEmitter();

const resultCollection = [];

eventEmitter.emit("foo");

eventEmitter.on("foo", (arg) => resultCollection.push([ "foo", "on", arg ]));
eventEmitter.on("bar", (arg) => resultCollection.push([ "bar", "on", arg ]));

eventEmitter.once("foo", (arg) => resultCollection.push([ "foo", "once", arg ]));

eventEmitter.emit("foo", 1);
eventEmitter.emit("foo", 2);

eventEmitter.emit("bar", 3);

assertEqual(
    new Set(resultCollection),
    new Set([
        [ "foo", "once", 1 ],
        [ "foo", "on", 1 ],
        [ "foo", "on", 2 ],
        [ "bar", "on", 3 ]
    ]),
    "Incorrect result collection"
);