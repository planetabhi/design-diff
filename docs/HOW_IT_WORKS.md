# Design Diff, a visual feedback loop for coding agents

A coding agent can write the markup, wire the styles, and ship a page in seconds. It can even look at that page. What it cannot do is measure it against the design, pixel for pixel. Glancing at a screenshot, it will not catch that the heading sits a few pixels too low, that the color has cooled by a shade, that the font quietly failed to load. It builds by eye, and the page drifts from the design with nothing exact to catch it.

Design Diff gives it that measure. It lays the design over a screenshot of the live page at the exact same pixel size, then returns one number for what matched and the box around what did not. Call it, read the score, fix what the box points at, call it again. That loop runs until the page matches the design, and no one has to be watching.

It is built agent-first, a command and a library that speak plain JSON, so any agent or script can drive it. The same signal serves people just as well, from developers closing a handoff to design engineers building a system to designers who want proof rather than a promise.

## Install

It runs on [Bun](https://bun.sh) and needs no global install, since `bunx` fetches and runs it in one step. The first run downloads Chromium once. Every run after that is instant.

## Quickstart

You have a running page and a PNG of the design. Point the tool at both and let them stand side by side.

```sh
bunx design-diff http://localhost:3000 --png home.png --open
```

It answers in three ways. A short report in the terminal. An interactive page in the browser where you lay one image over the other. And a folder of artifacts, written to `.design-diff` by default, one timestamped run at a time, or wherever you point `--out`. An agent skips the browser and reads the JSON, but the loop is the same, question to answer and back again.

```
DESIGN DIFF
────────────────────────

Visual match    92.4%

Diff bounds
x=0..1440
y=812..980
page coverage=17.1%
```

Ninety-two percent of the pixels line up. The rest is gathered near the foot of the frame, between the lines it names. You know where to look before you even open the report, and knowing where the trouble sits is half the fix.

Every flag appears in context throughout this piece, and `design-diff --help` lists them all.

## How measurement works

The loop only works if the number can be trusted, and three things make it so. A shared frame of reference, a page caught at the right moment, and a score you can read at a glance.

### One frame of reference

Measurement needs a common ground. Two things can be compared only on the same scale, so the design sets the size and the page is captured at that exact width and height. Laid on one measure, they line up point for point, with no room for a false reading.

### Caught at the right moment

Design Diff does not capture in haste. It waits for the fonts to load, for the images to arrive, for the network to settle, and it turns off animation and the blinking caret. Most false diffs come from catching a page mid-render. If the fonts still are not ready, it says so in the output instead of handing you a bad score in silence. For an agent looping toward a match, this is what keeps the signal honest. The number moves only when the page truly changed, not when it was caught too early.

### A score you can read

Every run prints three measures and writes them to metrics.json in the run folder.

| Metric | What it tells you |
| --- | --- |
| Visual match | How many pixels line up. The headline score. |
| Diff bounds | The box enclosing every changed pixel, in CSS pixels. A tight box means one component is off. A box spanning the page points at a layout, viewport, or font problem. |
| Page coverage | How much of the page that box spans. Tells a local issue from a global one. |

The shape of the diff is the diagnosis. A small box on a button is a mistaken color. A box that spans the page is a font that never loaded or a viewport that does not match. Read the shape, not the number alone. The number says something is wrong, the shape says what. For an agent this is a ready-made reward signal. A match percentage to climb, and the diff bounds to point the next edit at.

```json
{
  "url": "http://localhost:3000",
  "matchPercent": 92.4,
  "diffPercent": 7.6,
  "changedPixels": 107251,
  "totalPixels": 1411200,
  "coveragePercent": 17.1,
  "diffBounds": { "x": 0, "y": 812, "width": 1440, "height": 168 },
  "readiness": { "fontsReady": true, "imagesComplete": true },
  "paths": {
    "design": ".design-diff/2026-08-16T14-22-09-482Z/design.png",
    "page": ".design-diff/2026-08-16T14-22-09-482Z/dom.png",
    "heatmap": ".design-diff/2026-08-16T14-22-09-482Z/heatmap.png",
    "overlay": ".design-diff/2026-08-16T14-22-09-482Z/overlay.html",
    "metrics": ".design-diff/2026-08-16T14-22-09-482Z/metrics.json"
  }
}
```

## Working with real designs and real pages

Real work is messier than a clean mockup against a static page. Design Diff meets it where it is, whether the source of truth lives in Figma, the page carries content that was always going to change, loads late, sits behind a login, or exists only as a screenshot on disk.

### Straight from Figma

No manual export. Give it a file key and a frame id and it fetches the frame size and PNG straight from the Figma API.

```sh
export DESIGN_DIFF_FIGMA_TOKEN=figd_your_token
bunx design-diff http://localhost:3000 --file abc123 --frame 10-2 --open
```

The frame id is the one in the frame URL, like 10-2. A read-only token is enough. This is the closest thing to a live handoff. The designer moves a component, you run it again, you see the drift at once. An agent can aim straight at a Figma frame as its target and never touch a local file.

### Mask what is meant to change

Real pages carry things that were always going to change. An avatar, a timestamp, a live counter, a random hero image. Counting those as faults is a quarrel with the nature of the page. Mask them so they never count.

By a fixed rectangle, in CSS pixels, repeated as often as you like.

```sh
bunx design-diff http://localhost:3000 --png home.png \
  --ignore 24,24,48,48 --ignore 0,900,1440,120
```

Or by CSS selector, which is wiser when the region moves or resizes between runs. Every element that matches is masked by its own live bounding box.

```sh
bunx design-diff http://localhost:3000 --png home.png \
  --ignore-selector "[data-dynamic], time, .avatar"
```

Masking by selector is what turns a flaky score into a steady one. It silences the noise that was never a real difference. For an agent iterating toward 100, a stable score is everything, since it needs the number to reflect its own edits and nothing else.

### Wait for readiness

Some pages wake late, or fetch their hero after a round-trip. Hold the capture until a chosen selector appears. If the selector never shows within fifteen seconds, it fails loudly rather than quietly handing you a bad screenshot.

```sh
bunx design-diff http://localhost:3000 --png home.png --wait-for ".hero-loaded"
```

### Pages behind a login

Save a session once with Playwright, then hand it over. No credentials ever touch the tool itself. The saved file holds only cookies and local storage. When it expires, make it again.

```sh
bunx playwright codegen --save-storage=auth.json https://your-app/login
# log in in the window, then close it
bunx design-diff https://your-app/dashboard --png dash.png --auth auth.json --open
```

### From two images

Sometimes both images already sit on disk and there is no page to visit. Let the browser sleep and lay the two side by side.

```sh
bunx design-diff --actual screenshot.png --png design.png --json
```

This is the fast path an agent uses in a tight loop. It has already captured the page by its own means, so Design Diff only diffs the two files and launches no browser at all. It works offline, in tests, and in sandboxes. With no live page there is no waiting and no selector masking, and scale is ignored since there is no screen to answer to, so the bounds come back in plain image pixels. Everything else is the same.

## Outputs for agents and humans

The same run answers two very different readers. A machine wants a number and a box. A person wants to see it. Design Diff gives each what it needs from one pass.

### The interactive report

The HTML report is not a static picture. It is a tool for holding two images as one.

- A reveal slider wipes between the design and the page. Drag the handle to move the seam across the frame.
- An opacity slider fades the design onto the page so a small shift shows itself.
- A heatmap lights up every changed pixel so nothing hides.
- A bounds box outlines the changed region so your eye goes straight to it.

It is retina-safe. When your export is drawn at twice the size, pass `--scale 2` and it keeps the measure honest.

### A shareable image

The HTML report is good in front of you, but it cannot travel into a pull request comment. Pass `--annotate` and it draws the diff box onto the page screenshot itself.

```sh
bunx design-diff http://localhost:3000 --png home.png --annotate
```

No browser needed to view it. Drop it into a review, a Slack thread, a CI artifact. Nothing is written when there is no diff, so an annotated file always means there is something to look at.

### JSON and the CI gate

Agents and pipelines want the numbers, not the page. `--json` prints only the metrics object to stdout, so a script or an agent reads it with no parsing. `--fail-under` sets the bar. If the visual match falls below it, the process exits 1 and the build goes red.

```sh
bunx design-diff http://localhost:3000 --png home.png --json --fail-under 98
```

This is the agent contract. Read the JSON, act on matchPercent and diffBounds, run again, and stop when the score is high enough.

One thing to keep straight. `--fail-under` is a percentage measured against the visual match. It is not `--threshold`, which is the per-pixel color sensitivity. One keeps the gate, the other tunes how strict each pixel comparison is. When you weigh many pages, or the same page again and again, pass `--no-overlay` to skip the HTML and keep only the metrics.

## Using it programmatically

The CLI is a convenience. The loop really lives in the library, one function you can call as fast as you can edit.

### The function

The CLI is a thin wrapper over one function that returns everything it computed, along with the path to every artifact.

```ts
import { designDiff } from "design-diff"

const result = await designDiff({
  url: "http://localhost:3000", // or actual: "screenshot.png" for image mode
  design: "home.png",           // or { fileKey, frameId }
  scale: 1,
  threshold: 0.1,
  ignore: [{ selector: "[data-dynamic]" }, { x: 24, y: 24, width: 48, height: 48 }],
  waitFor: ".hero-loaded",
})

if (result.matchPercent < 98) process.exit(1)
```

You get back matchPercent, diffPercent, changedPixels, totalPixels, coveragePercent, diffBounds, the readiness signals, and the paths to the design, page, heatmap, overlay, annotated image, and metrics. The same object it writes to metrics.json, with nothing useful thrown away. An agent reads matchPercent to know how close it is and diffBounds to know where to edit next, then calls the function again.

### Reuse the browser

Checking a whole app? Launch Chromium once and pass it into every call. It is a real speed win when a suite or an agent runs the tool over and over.

```ts
import { designDiff, launchBrowser } from "design-diff"

const browser = await launchBrowser()
try {
  for (const page of pages) {
    const r = await designDiff({ url: page.url, design: page.design, browser })
    console.log(page.url, r.matchPercent)
  }
} finally {
  await browser.close()
}
```

## The honest limits

Design Diff compares pixels, not perception, so read the score as a guide and not a verdict. Anti-aliasing and font rendering vary across machines, so a real page against a design export settles just short of a clean hundred even when it looks right. Choose a threshold rather than chase the last point. The design and the page must be the same size, since a large mismatch is a hard error by design. And a high score is necessary but not sufficient, because a shifted component can still hide inside it. The diff box and a human eye stay the final check.

## The bottom line

Visual regression tools compare an app to its own past, which catches change no one intended. Design Diff compares the app to the design, which catches the thing that matters at handoff, the gap between what was drawn and what was built.

It is small and asks no allegiance to a service. Most tools in this space are built for a person to look at a report. This one is built to be read by a machine and acted on in a loop, so an agent can drive the page toward the design on its own, and it still hands a person a picture that ends the argument. Point it at your page, read the box, and close the gap.
