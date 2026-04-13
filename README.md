# DOMQuake

Observe web UI state on any web page.

``` js
new DOMQuake()
  .on("transition", (event, detail) => pauseAgentCalls())
  .observe();

new DOMQuake()
  .on("idle", (event, detail) => resumeAgentCalls())
    .observe();
```