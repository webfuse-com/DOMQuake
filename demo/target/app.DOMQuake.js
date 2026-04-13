window.addEventListener("message", event => {
    if(event.data.type !== "observe") return;

    observe(event.data.data.id, event.data.data.threshold);
});


function observe(id, threshold = 0.5) {
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
}



/* 
observe(0.5);
observe(0.0175); */