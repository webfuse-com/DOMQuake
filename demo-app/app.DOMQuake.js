new DOMQuake()
    .on("*", (event, detail) => {
        console.log("[threshold=0.5 (default)]", event, detail);
    })
    .observe();

new DOMQuake({
    threshold: 0.015
})
    .on("*", (event, detail) => {
        console.log("[threshold=0.015]", event, detail);
    })
    .observe();