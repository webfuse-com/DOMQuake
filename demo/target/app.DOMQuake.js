window.addEventListener("message", event => {
    if(event.data?.type !== "observe") return;

    const data = event.data.data;
    const id = data.id;
    const threshold = data.threshold;

    new DOMQuake({
        threshold
    }, true)
        .on("*", (event, detail) => {
            window.parent.postMessage({
                type: "event",
                data: {
                    id,
                    event,
                    detail
                }
            }, "*");

            console.log(`[threshold=${threshold}]`, event, detail);
        })
        .observe();
});