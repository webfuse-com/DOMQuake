import { readFile } from "fs/promises";
import { join } from "path";

import puppeteer from "puppeteer";


const INTEGRATION_MODULE_PATHS = [
    "./app.js",
    "../../dist/DOMQuake.js"
];

const ARGUMENTS = process.argv.slice(2);
const HEADLESS = !ARGUMENTS.includes("--no-headless");
const KEEPALIVE = ARGUMENTS.includes("--keepalive");
const APPS = [
    {
        test: "app.static",
        expectedEventChain: [ "stable" ],
        extraWait: 100,
    },
    {
        test: "app.dynamic.harmonic.minor",
        expectedEventChain: [ "stable" ],
        extraWait: 1000,
    },
    {
        test: "app.dynamic.harmonic.minor.acc",
        expectedEventChain: [ "stable" ],
        extraWait: 3500,
    },
    {
        test: "app.dynamic.harmonic.major",
        expectedEventChain: [ "stable", "transition", "stable", "transition", "stable", "transition" ]
    },
    {
        test: "app.dynamic.hydrated.minor",
        expectedEventChain: [ "stable" ],
        extraWait: 3500
    },
    {
        test: "app.dynamic.hydrated.major",
        expectedEventChain: [ "stable", "transition", "stable", "transition", "stable" ],
        extraWait: 1000
    },
    {
        test: "app.dynamic.hydrated.major-minor",
        expectedEventChain: [ "stable" ],
        extraWait: 3500
    }
];
const FILTERED_APPS = (() => {
    const index = ARGUMENTS.indexOf("--app") + 1;

    if(!index) return APPS;

    const specificAppTest = ARGUMENTS[index];

    if(!specificAppTest) return APPS;

    return APPS.filter(app => app.test === specificAppTest);
})();


async function runBrowser(url, inPageCallback, inPageCallbackArgs = [], options = {}) {
    const optionsWithDefaults = {
        headless: true,
        keepalive: false,
        viewport: [ 1300, 975 ],

        ...options
    };

    const browser = await puppeteer.launch({
        args: [
            `--window-size=${optionsWithDefaults.viewport[0]},${optionsWithDefaults.viewport[1]}`,
            '--allow-file-access-from-files',
            '--disable-web-security'
        ],
        defaultViewport: null,
        headless: optionsWithDefaults.headless
    });

    const page = (await browser.pages())[0];

    for(const path of INTEGRATION_MODULE_PATHS) {
        const script = (
            await readFile(join(import.meta.dirname, path))
        ).toString();

        await page.evaluateOnNewDocument(script);
    }

    await page.evaluateOnNewDocument((cb, ...args) => {
        document.addEventListener("DOMContentLoaded", async () => {
            const fn = new Function(`return (${cb})`)();

            window.__testResult = await fn(...args);
        });
    }, inPageCallback.toString(), ...inPageCallbackArgs);

    await page.goto(url, {
        waitUntil: "load"
    });

    await page.waitForFunction(() => (window.__testResult !== undefined));

    const result = await page.evaluate(() => window.__testResult);

    if(!optionsWithDefaults.keepalive) {
        await browser.close();
    }

    return result;
}


process.on("exit", code => {
    switch(code) {
        case 0:
            console.log(`\x1b[32mTests succeeded.\x1b[0m`);

            break;
        case 2:
            console.error(`\x1b[31mTests failed (exit code ${code}).\x1b[0m`);

            break;
    }
});


for(const reference of FILTERED_APPS) {
    const returnValue = await runBrowser(
        `file://${join(import.meta.dirname, reference.test.replace(/(\.html)?$/i, ".html"))}`,
        async reference => {
            const EVENTS = [ "transition", "stable" ];
            const TIMEOUT_MS = 3500;
            const STABLE_EPSILON_MS = 600; // decayed intensity
            const TRANSITION_EPSILON_MS = 100;
            const INIT_DELAY_MS = 500;

            const domQuake = new DOMQuake();

            const referenceEvents = [];
            const detectedEvents = [];

            let collectionResolve = null;

            const onCollected = () => {
                if(!collectionResolve) return;

                collectionResolve();

                collectionResolve = null;
            };

            for(const event of EVENTS) {
                window.addEventListener(event, e => {
                    if(e.detail !== "test") return;

                    const tNow = Math.round(performance.now());

                    referenceEvents.push({ event, timestamp: tNow });

                    console.log("+ [reference]", tNow, event);

                    onCollected();
                });

                domQuake.on(event, detail => {
                    const tNow = Math.round(performance.now());

                    detectedEvents.push({ event, timestamp: tNow });

                    console.log("- [detected]", tNow, event, detail);

                    onCollected();
                });
            }

            domQuake.observe();

            const expectedCount = reference.expectedEventChain.length;

            const collectionTimeout = new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error(`Timeout collecting ${expectedCount} events`)),
                    TIMEOUT_MS * expectedCount
                );
            });

            try {
                await Promise.race([
                    collectionTimeout,
                    (async () => {
                        while(
                            referenceEvents.length < expectedCount ||
                            detectedEvents.length < expectedCount
                        ) {
                            await new Promise(resolve => {
                                collectionResolve = resolve;
                            });
                        }
                    })()
                ]);
            } catch(err) {
                return { error: err?.message ?? err.toString() };
            }

            for(let i = 0; i < expectedCount; i++) {
                const event = reference.expectedEventChain[i];
                const referenceEvent = referenceEvents[i];
                const detectedEvent = detectedEvents[i];

                if(referenceEvent.event !== event) {
                    return {
                        error: `Expected reference event '${event}' at (${i}), got '${referenceEvent.event}'`
                    };
                }

                if(detectedEvent.event !== event) {
                    return {
                        error: `Expected detected event '${event}' at (${i}), got '${detectedEvent.event}'`
                    };
                }

                const timestampDifference = Math.ceil(detectedEvent.timestamp - referenceEvent.timestamp);
                const timestampDelta = Math.abs(timestampDifference);

                console.log("Δ", `${timestampDifference >= 0 ? "+" : "-"}${timestampDelta}`);

                let epsilon = (event === "stable" ? STABLE_EPSILON_MS : TRANSITION_EPSILON_MS);
                epsilon += (i ? 0 : INIT_DELAY_MS);

                if(timestampDelta <= epsilon) continue;

                return {
                    error: `Significant time delta for '${event}' (${i}): ${timestampDelta}ms`
                };
            }

            const extraWaitTimeout = new Promise(resolve => {
                setTimeout(() => resolve({}), reference.extraWait);
            });
            const extraEvent = new Promise(resolve => {
                domQuake.once("*", event => resolve({
                    error: `Unexpected extra event '${event}'`
                }));
            });

            return Promise.race([
                extraWaitTimeout,
                extraEvent
            ]);
        }, [
            reference
        ], {
            headless: HEADLESS,
            keepalive: KEEPALIVE
        }
    );

    console.log(`\x1b[2m${reference.test}\x1b[0m`);

    if(!returnValue.error) continue;

    console.error(`\x1b[31m${returnValue.error}\x1b[0m`);

    !KEEPALIVE && process.exit(2);
}