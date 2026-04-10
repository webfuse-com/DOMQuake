new DOMQuake()
    .on("*", (event, detail) => {
        console.log("[threshold=0.5 (default)]", event, detail);
    })
    .observe();

new DOMQuake({
    threshold: 0.0175
})
    .on("*", (event, detail) => {
        console.log("[threshold=0.0175]", event, detail);
    })
    .observe();