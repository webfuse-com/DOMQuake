import { join } from "path";
import { readFile } from "fs/promises";
import { createServer } from "http";

import puppeteer from "puppeteer";


const DEFAULT_THRESHOLD = 0.75;
const DIST_APP_MODULE = (await readFile(join(import.meta.dirname, "../dist.browser/DOMQuake.js"))).toString();
const DEMO_APP_URL = `file://${join(import.meta.dirname, "./app/app.html")}`;
const TIMELINE_APP_PORT = 5000;
const TIMELINE_APP_URL = `http://localhost:${TIMELINE_APP_PORT}/app.html`;
const ARGUMENTS = process.argv.slice(2);
const URL = ARGUMENTS[0]
    ? (!/^https?:\/\//i.test(ARGUMENTS[0])? `https://${ARGUMENTS[0]}` : ARGUMENTS[0])
    : DEMO_APP_URL;
const THRESHOLD = (() => {
    let threshold = parseFloat(ARGUMENTS[1]);
    threshold = !isNaN(threshold) ? threshold : DEFAULT_THRESHOLD;

    return threshold;
})();


async function runServer() {
    return new Promise(resolve => {
        createServer(async (req, res) => {
            try {
                const path = join(import.meta.dirname, "./timeline-app/", decodeURIComponent(req.url.split("?")[0]));

                res.end(await readFile(path));
            } catch {
                res.statusCode = 404;

                res.end();
            }
        })
            .listen(TIMELINE_APP_PORT, resolve);
    });
} 


async function runBrowser(url, inPageCallback, inPageCallbackArgs = [], options = {}) {
    const optionsWithDefaults = {
        viewport: [ 1600, 1200 ],

        ...options
    };

    const browser = await puppeteer.launch({
        args: [
            `--window-size=${optionsWithDefaults.viewport[0]},${optionsWithDefaults.viewport[1]}`,
            '--allow-file-access-from-files',
            '--disable-web-security'
        ],
        defaultViewport: null,
        headless: false
    });

    const page = (await browser.pages())[0];

    page.on("domcontentloaded", async () => {
        page.evaluate(inPageCallback, ...inPageCallbackArgs);
    });

    await page.goto(url, {
        waitUntil: "load"
    });
}


await runServer();

await runBrowser(URL, async (THRESHOLD, DIST_APP_MODULE, TIMELINE_APP_URL) => {
    const TIMELINE_HEIGHT = 170;

    eval(DIST_APP_MODULE);

    const iframeElement = document.createElement("IFRAME");

    iframeElement.setAttribute("src", `${TIMELINE_APP_URL}?t=${THRESHOLD}`);
    iframeElement.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        height: ${TIMELINE_HEIGHT}px;
        box-sizing: border-box;
        border: none;
        outline: none;
        z-index: 1000000;
    `;

    document.documentElement.style.paddingBottom = `${TIMELINE_HEIGHT}px`; 

    document.body.appendChild(iframeElement);

    new DOMQuake({
        threshold: THRESHOLD
    }, true)
        .on("*", (event, detail) => {
            iframeElement.contentWindow.postMessage({
                type: "dom-quake",
                data: {
                    event,
                    detail
                }
            }, "*");
        })
        .observe();
}, [
    THRESHOLD,
    DIST_APP_MODULE,
    TIMELINE_APP_URL
]);

console.log("\x1b[2mDemo running...\x1b[0m");