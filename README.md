# Heatline – Usability Tracker & Heatmap Engine

A lightweight, dependency-free JavaScript tracker that records how people use a web page and paints the result back as a heatmap. Built as a lab project with plain HTML, CSS and JavaScript.

## Features

- **Click tracking** with target tag, id, class, text and page coordinates
- **Mouse movement sampling**, throttled to one sample every 250 ms
- **Scroll depth** and time spent on each part of the page
- **Rage-click detection** (3 or more clicks within 700 ms in a 40 px area)
- **Three heatmaps** drawn on a canvas overlay: clicks, movement and scroll attention
- **Live dashboard**: counters, most-clicked elements and a real-time event stream
- **Export** the session as JSON or CSV
- **Privacy friendly**: data stays in the browser tab, nothing is sent anywhere

## Project structure

```
usability-tracker/
├── index.html        Demo site and dashboard
├── css/style.css     Styles (light and dark, responsive)
├── js/tracker.js     Tracking and heatmap engine
├── js/app.js         Dashboard UI, dock controls, hero cursor trail
├── README.md
└── LICENSE
```

## Run it

No build step is needed.

1. Clone the repository: `git clone https://github.com/<your-username>/usability-tracker.git`
2. Open `index.html` in a browser (or run `npx serve .` / `python3 -m http.server`).
3. Move the mouse, scroll and click around, then use the control bar at the bottom of the page to show a heatmap or download your data.

## Use the tracker on any page

```html
<script src="js/tracker.js"></script>
<script>
  UsabilityTracker.renderHeatmap('click');   // 'click' | 'move' | 'scroll'
  UsabilityTracker.clearHeatmap();
  const json = UsabilityTracker.exportJSON();
  const csv  = UsabilityTracker.exportCSV();
</script>
```

Add `data-tracker-ignore` to any element you do not want tracked (for example your own toolbar).

## API

| Method | Description |
| --- | --- |
| `getLogs()` | Array of every recorded event |
| `getState()` | Counters, max scroll depth, scroll dwell bands, click targets |
| `subscribe(fn)` | Call `fn(entry, state)` on every new event |
| `renderHeatmap(type)` | Draw a heatmap overlay and return the number of data points |
| `clearHeatmap()` | Remove the overlay |
| `exportJSON()` / `exportCSV()` | Session data as a string |
| `reset()` | Clear all recorded data |
| `elapsedMs()` | Time since the tracker started |

## Event format

```json
{
  "sessionId": "session_k3j9x2a",
  "eventType": "click",
  "timestamp": "2026-10-01T10:15:30.000Z",
  "timeOffsetMs": 5231,
  "targetTag": "BUTTON",
  "targetId": null,
  "targetClass": "btn btn-heat",
  "targetText": "Choose Team",
  "x": 612,
  "y": 1180,
  "viewportW": 1440,
  "viewportH": 900,
  "rage": true
}
```

`mousemove` events contain `x` and `y`; `scroll` events contain `depthPercent`. The `rage` field only appears on rage clicks.

## How the heatmap works

Each point is drawn as a soft radial brush with low opacity, so overlapping points accumulate. The accumulated opacity is then mapped through a blue → violet → red → orange → yellow gradient, so the busiest areas appear hottest.

## Limitations

- Data is held in memory and lost on page refresh.
- Heatmaps are drawn for the current layout; after resizing, the overlay is re-rendered.
- Touch events are not tracked yet.

## Ideas for extension

- Send logs to a backend with `navigator.sendBeacon`
- Add touch and keyboard tracking
- Session replay from the recorded cursor path

## License

MIT – see [LICENSE](LICENSE).
