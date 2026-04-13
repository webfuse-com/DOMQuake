# DOMQuake

Observe UI state on any web page.

``` js
new DOMQuake()
  .on("transition", pauseAgentCalls)
  .on("stable", resumeAgentCalls)
  .observe();

new DOMQuake({
  root: document.querySelector("footer"),
  threshold: 0.9  // (think of 90% UI change; default: 0.5)
})
  .once("transition", ({ intensity }) => {
    console.log("Intensity": intensity)
  })
  .observe();
```
