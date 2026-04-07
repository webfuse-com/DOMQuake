window.__signalEvent = function(event) {
    window.dispatchEvent(
        new CustomEvent(event, {
            detail: "test"
        })
);
};