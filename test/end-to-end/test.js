import { readFile } from "fs/promises";
import { join } from "path";

import puppeteer from "puppeteer";


const INTEGRATION_MODULE_PATHS = [
    "./app.js",
    "../../dist/api.js"
];

const ARGUMENTS = process.argv.slice(2);
const HEADLESS = !ARGUMENTS.includes("--no-headless");
const KEEPALIVE = ARGUMENTS.includes("--keepalive");
const APPS = [
    {
        test: "app.static",
        expectedEventChain: [ "idle" ],
        extraWait: 100,
    },
    {
        test: "app.dynamic.harmonic.minor",
        expectedEventChain: [ "idle" ],
        extraWait: 1000,
    },
    {
        test: "app.dynamic.harmonic.major",
        expectedEventChain: [ "idle", "transition", "idle", "transition", "idle", "transition" ]
    },
    {
        test: "app.dynamic.hydrated.minor",
        expectedEventChain: [ "idle" ],
        extraWait: 3000
    },
    {
        test: "app.dynamic.hydrated.major",
        expectedEventChain: [ "idle", "transition", "idle", "transition" ],
        extraWait: 1000
    },
    {
        test: "app.dynamic.hydrated.major-minor",
        expectedEventChain: [ "idle", "transition", "idle" ],
        extraWait: 3000
    }
];
const FILTERED_APPS = (() => {
    const index = ARGUMENTS.indexOf("--app") + 1;

    if(!index) return APPS;

    const specificAppTest = ARGUMENTS[index];

    if(!specificAppTest) return APPS;

    return APPS.filter(app => app.test === specificAppTest); 
})();


async function runBrowser(url, inPageCallback, inPageCallbackArgs, options = {}) {
    const optionsWithDefaults = {
        headless: true,
        keepalive: false,
        viewport: [ 1500, 900 ],

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
        const script = (await readFile(join(import.meta.dirname, path))).toString();

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
            const TEST_CASE_TIMEOUT_MS = 3000;
            const TEST_TIMESTAMP_EPSILON_MS = 75;

            const domQuake = new DOMQuake();

            domQuake
                .on("*", (event, data) => console.log("Event:", event, data))
                .observe();

            const eventPromises = reference.expectedEventChain
                .map(event => {
                    const expectedTimestamp = new Promise(resolve => {
                        const cb = () => {
                            resolve(window.performance.now());

                            window.removeEventListener(event, cb);
                        };

                        window.addEventListener(event, cb);
                    });
                    const detectedTimestamp = new Promise(resolve => {
                        domQuake.once(event, () => resolve(window.performance.now()));
                    });

                    return {
                        event,
                        expectedTimestamp,
                        detectedTimestamp
                    };
                });

            for(let i = 0; i < eventPromises.length; i++) {
                const { event, expectedTimestamp, detectedTimestamp } = eventPromises[i];

                const timeout = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Timeout waiting for '${event}' (${i})`));
                    }, TEST_CASE_TIMEOUT_MS);
                });

                let timestamps;
                try {
                    timestamps = await Promise.race([
                        timeout,
                        Promise.all([ expectedTimestamp, detectedTimestamp ])
                    ]);
                } catch(err) {
                    return { error: err?.message ?? err.toString() };
                }

                const timestampDelta = Math.abs(timestamps[0] - timestamps[1]);

                if(timestampDelta > TEST_TIMESTAMP_EPSILON_MS) {
                    return {
                        error: `Significant time delta for '${event}' (${i}): ${Math.ceil(timestampDelta)}ms`
                    };
                }
            }

            const extraEvent = new Promise(resolve => {
                domQuake.once("*", event => resolve({
                    error: `Unexpected extra event '${event}'`
                }));
            });
            const timeout = new Promise(resolve => {
                setTimeout(() => resolve({}), reference.extraWait);
            });

            return Promise.race([
                timeout,
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