class TimelineChart {
    static #color = {
        bar: "#7290FD",
        threshold: "#DF686C",
        axisLine: "#E5E6E9",
        axisText: "#8C8D8F",
        regime: "#FFEAEC"
    };

    static #barWidth = 6;
    static #barGap = 2;
    static #padding = 36;
    static #yLabelDistance = 5;

    #bars = [];
    #regimes = [];
    #activeRegime = null;
    #threshold;
    #id;
    #canvas;
    #ctx;

    constructor(threshold = null) {
        this.#threshold = threshold;

        this.#id = ~~(Math.random() * 999 + 1000);

        window.addEventListener("message", event => {
            if(event.data.type !== "event") return;

            const data = event.data.data;

            if(event.data.data.id != this.#id) return;

            (data.event === "transition") && this.startRegime();
            (data.event === "stable") && this.endRegime();

            this.addBar(data.detail.intensity);
        });

        document.querySelector("iframe")
            .contentWindow
            .postMessage({
                type: "observe",
                data: {
                    id: this.#id,
                    threshold
                }
            }, "*");

        const element = document.querySelector("#chart-template").content.cloneNode(true);

        this.#canvas = element.querySelector("canvas");
        this.#ctx = this.#canvas.getContext("2d");

        document.querySelector("header").appendChild(element);

        this.#bars.push({
            value: 0
        });
        this.#draw();
    }

    #chartArea() {
        return {
            x: TimelineChart.#padding,
            y: TimelineChart.#padding,
            w: this.#canvas.width - TimelineChart.#padding - TimelineChart.#padding,
            h: this.#canvas.height - TimelineChart.#padding - TimelineChart.#padding
        };
    }

    #maxVal() {
        const dataMax = this.#bars.length
            ? Math.max(...this.#bars.map((bar) => bar.value))
            : 1;
        const thresholdMax = this.#threshold ?? 0;

        return Math.min(Math.max(dataMax, thresholdMax, 0.25), this.#threshold * 2) * 1.2;
    }

    #computeTicks(maxVal) {
        const step = Math.pow(10, Math.floor(Math.log10(maxVal)));
        const count = Math.ceil(maxVal / step);

        return Array.from({ length: count + 1 }, (_, i) => i * step);
    }

    #yForVal(value, area, maxVal) {
        return area.y + area.h - (value / maxVal) * area.h;
    }

    #draw() {
        const area = this.#chartArea();
        const maxVal = this.#maxVal();

        this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#drawRegimes(area);
        this.#drawGrid(area, maxVal);
        this.#drawBars(area, maxVal);
        this.#drawThreshold(area, maxVal);

        this.#drawAxes(area, maxVal);
    }

    #drawRegimes(area) {
        const step = TimelineChart.#barWidth + TimelineChart.#barGap;
        const offset = TimelineChart.#barGap * 2;

        for(const regime of this.#regimes) {
            const x1 = area.x + regime.start * step - offset;
            const endIndex = regime.end ?? (this.#bars.length - 1);
            const x2 = area.x + endIndex * step + TimelineChart.#barWidth + offset;

            this.#ctx.fillStyle = TimelineChart.#color.regime;
            this.#ctx.fillRect(x1, area.y, x2 - x1, area.h);
        }
    }

    #drawGrid(area, maxVal) {
        const ticks = this.#computeTicks(maxVal);

        this.#ctx.strokeStyle = TimelineChart.#color.axisLine;
        this.#ctx.lineWidth = 0.5;

        for(const tick of ticks) {
            const y = this.#yForVal(tick, area, maxVal);

            this.#ctx.beginPath();
            this.#ctx.moveTo(area.x, y);
            this.#ctx.lineTo(area.x + area.w, y);
            this.#ctx.stroke();
        }
    }

    #drawBars(area, maxVal) {
        const step = TimelineChart.#barWidth + TimelineChart.#barGap;

        for(let i = 0; i < this.#bars.length; i++) {
            const bar = this.#bars[i];
            const x = area.x + i * step;
            const barHeight = (bar.value / maxVal) * area.h;

            this.#ctx.fillStyle = bar.color || TimelineChart.#color.bar;
            this.#ctx.fillRect(x, area.y + area.h - barHeight, TimelineChart.#barWidth, barHeight);
        }
    }

    #drawThreshold(area, maxVal) {
        const y = this.#yForVal(this.#threshold, area, maxVal);

        this.#ctx.save();
        this.#ctx.strokeStyle = TimelineChart.#color.threshold;
        this.#ctx.lineWidth = 1;
        this.#ctx.setLineDash([ 4, 2 ]);
        this.#ctx.beginPath();
        this.#ctx.moveTo(area.x, y);
        this.#ctx.lineTo(area.x + area.w, y);
        this.#ctx.stroke();
        this.#ctx.setLineDash([]);
        this.#ctx.fillStyle = TimelineChart.#color.threshold;
        this.#ctx.font = "14px sans-serif";
        this.#ctx.textAlign = "left";
        this.#ctx.textBaseline = "middle";
        this.#ctx.fillText(this.#threshold, area.x + 4, y - 10);
        this.#ctx.restore();
    }

    #drawAxes(area, maxVal) {
        const step = TimelineChart.#barWidth + TimelineChart.#barGap;
        const ticks = this.#computeTicks(maxVal);

        this.#ctx.fillStyle = TimelineChart.#color.axisText;
        this.#ctx.font = "11px sans-serif";
        this.#ctx.textAlign = "right";

        for(const tick of ticks) {
            const y = this.#yForVal(tick, area, maxVal);

            this.#ctx.fillText(tick.toPrecision(1), area.x - 6, y + 4);
        }

        this.#ctx.textAlign = "center";

        for(let i = 0; i < this.#bars.length; i += TimelineChart.#yLabelDistance) {
            const x = area.x + i * step + TimelineChart.#barWidth / 2;

            this.#ctx.fillText(i, x, area.y + area.h + 16);
        }

        this.#ctx.strokeStyle = TimelineChart.#color.axisLine;
        this.#ctx.lineWidth = 0.5;
        this.#ctx.beginPath();
        this.#ctx.moveTo(area.x, area.y);
        this.#ctx.lineTo(area.x, area.y + area.h);
        this.#ctx.lineTo(area.x + area.w, area.y + area.h);
        this.#ctx.stroke();
    }

    addBar(value, color = null) {
        this.#bars.push({
            value, color
        });

        const barsWidth = TimelineChart.#padding + TimelineChart.#padding +
            this.#bars.length * (TimelineChart.#barWidth + TimelineChart.#barGap);

        const parent = this.#canvas.parentElement;
        const wasAtEnd = parent.scrollLeft + parent.clientWidth >= parent.scrollWidth - 1;

        if(barsWidth > this.#canvas.width) {
            this.#canvas.width = barsWidth;
        }

        this.#draw();

        if(wasAtEnd) {
            parent.scrollLeft = parent.scrollWidth;
        }
    }

    startRegime() {
        if(this.#activeRegime) return false;

        this.#activeRegime = {
            start: this.#bars.length,
            end: null
        };

        this.#regimes.push(this.#activeRegime);
        this.#draw();

        return true;
    }

    endRegime() {
        if(!this.#activeRegime) return false;

        this.#activeRegime.end = this.#bars.length - 1;
        this.#activeRegime = null;
        this.#draw();

        return true;
    }
}