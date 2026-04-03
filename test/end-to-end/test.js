import { join } from "path";

import puppeteer from "puppeteer";


const HEADLESS = !process.argv.slice(2).includes("--no-headless");
const TEST_TIMESTAMP_EPSILON_MS = 500;
const INTEGRATION_MODULE_PATHS = [
    "../../dist/api.js",
    "./app.js"
];


async function runBrowser(url, inPageCallback, inPageCallbackArgs, options = {}) {
    const optionsWithDefaults = {
        headless: true,
        keepalive: false,
        viewport: [ 1500, 900 ],

        ...options
    };

    return new Promise(async resolve => {
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

        await page.goto(url, {
            waitUntil: "domcontentloaded"
        });

        for(const path of INTEGRATION_MODULE_PATHS) {
            await page.addScriptTag({
                path: join(import.meta.dirname, path)
            });
        }

        let result;
        const evalInPageCallback = async () => {
            result = await page.evaluate(inPageCallback, ...inPageCallbackArgs);
        };

        await evalInPageCallback();

        !optionsWithDefaults.keepalive
            && await browser.close();

        resolve(result);
    });
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


[
    {
        test: "app.static",
        expectedEventChain: [ "idle" ]
    }
]
    .forEach(async reference => {
        console.log(`\x1b[2m${reference.test}\x1b[0m`);

        const assertInTime = async (event, index) => {
            const returnValue = await runBrowser(
                `file://${join(import.meta.dirname, reference.test.replace(/(\.html)?$/i, ".html"))}`,
                async (event, index) => {
                    const TEST_CASE_TIMEOUT_MS = 5000;

                    const expectedTimestamp = new Promise(resolve => {
                        window.addEventListener(event, () => resolve(window.performance.now()));
                    });
                    const detectedTimestamp = new Promise(resolve => {
                        new DOMQuake()
                            .on(event, () => resolve(window.performance.now()))
                            .observe();
                    });

                    const timeout = new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(`Timeout '${event}' (${index})`));
                        }, TEST_CASE_TIMEOUT_MS);
                    });

                    try {
                        const timestamps = await Promise.race([
                            timeout,
                            Promise.all([
                                expectedTimestamp,
                                detectedTimestamp
                            ])
                        ]);

                        return {
                            result: Math.abs(timestamps[0] - timestamps[1])
                        };
                    } catch(err) {
                        return {
                            error: err?.message ?? err.toString()
                        };
                    }
                }, [
                    event, index
                ], {
                    headless: HEADLESS
                }
            );

            if(returnValue.error) throw new Error(returnValue.error);

            const timestampDelta = returnValue.result;

            if(timestampDelta <= TEST_TIMESTAMP_EPSILON_MS) return;

            console.error(`\x1b[31mTiming Error '${event}' (${index})\x1b[0m`);
            console.log(`\x1b[2mDELTA (ms): ${timestampDelta}:\x1b[0m`);

            process.exit(2);
        };
        
        for(let i = 0; i < reference.expectedEventChain.length; i++) {
            const expectedEvent = reference.expectedEventChain[i];

            await assertInTime(expectedEvent, i);
        }
    });