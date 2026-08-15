# Design Diff

A coding agent can build a page and even look at it, but it cannot measure it against the design pixel for pixel. Design Diff does. It overlays the design on a screenshot of the live page at the same pixel size and returns one number for what matched plus the box around what did not. Call it, read the score, fix what the box points at, and repeat until the page matches.

**It reduces to two values an agent acts on.**

- **`matchPercent`** — how close the page is to the design.
- **`diffBounds`** — the box around what is still wrong.

Read the first to know when to stop, aim the next edit at the second, and loop. Everything else in this README exists to make those two numbers trustworthy.

Built agent-first. An agent or script drives it and reads back plain JSON. People get a slider and heatmap report to eyeball the same diff. And CI gets a hard pass/fail gate for merges.

## Usage

```sh
# local design export
bunx design-diff http://localhost:3000 --png design.png --scale 1 --open

# or pull the export from Figma
bunx design-diff http://localhost:3000 --file <fileKey> --frame <node-id> --scale 1 --open
```

> Note: The first run downloads Chromium once, then every run is instant. Needs [Bun](https://bun.sh).

```
--png <path>        Design export (PNG) to compare against.
--file <key>        Figma file key. Use with --frame instead of --png.
--frame <node-id>   Figma frame to export (from the frame's URL).
--actual <path>     Compare a local PNG instead of screenshotting the url.
--scale <n>         Match the export: 1 for 1x, 2 for retina (default 1).
--threshold <0..1>  pixelmatch colour threshold, lower is stricter (default 0.1).
--auth <path>       Playwright storageState for pages behind login.
--out <dir>         Where the report is written (default .design-diff).
--ignore <x,y,w,h>  Rectangle (CSS px) to exclude from the diff. Repeatable.
--ignore-selector <sel>  CSS selector whose elements are masked. Repeatable.
--wait-for <sel>    Wait for this selector before capturing. Repeatable.
--no-overlay        Skip writing overlay.html and heatmap.png.
--annotate          Also write annotated.png with the diff box drawn on it.
--fail-under <pct>  Exit 1 when the visual match is below this percentage.
--json              Print the result as JSON to stdout and nothing else.
--open              Open the report when done.
```

## How it works

The design PNG sets the size, the page is screenshotted at the same pixel dimensions, so the two line up exactly. It waits for fonts and images to load and turns off animations before capturing.

With `--file/--frame`, it pulls the frame's size and PNG from the Figma API instead. Set `DESIGN_DIFF_FIGMA_TOKEN` to a Figma personal access token, created under Settings → Security → Personal access tokens. Read-only file access is enough, and view access to the file is all it needs. See [Figma's access token docs](https://www.figma.com/developers/api#access-tokens).

Use `--ignore` to mask dynamic regions (avatars, timestamps) so they never count as differences. Coordinates are CSS pixels, repeat the flag for multiple boxes. Prefer `--ignore-selector` when the region moves or resizes. Every element matching the selector is masked by its live bounding box.

```sh
bunx design-diff http://localhost:3000 --png design.png \
  --ignore 24,24,48,48 --ignore-selector "[data-dynamic], time"
```

Use `--wait-for` to hold the capture until a selector appears, removing most “still loading” flakes. It errors if the selector never shows within 15s.

```sh
bunx design-diff http://localhost:3000 --png design.png --wait-for ".hero-loaded"
```

## Compare two images

Skip the browser entirely and diff two local PNGs with `--actual`. Handy offline, in tests, or when you already captured the screenshot elsewhere.

```sh
bunx design-diff --actual screenshot.png --png design.png --json
```

No page means no `--wait-for`, `--ignore-selector`, or `readiness`. `--scale` is ignored too. Bounds are reported in image pixels. Everything else works the same.

## Pages behind login

Save a logged-in session once, then pass it with `--auth`.

```sh
bunx playwright codegen --save-storage=auth.json https://your-app/login

# log in in the window, then close it
bunx design-diff https://your-app/dashboard --png design.png --auth auth.json --open
```

`auth.json` holds cookies and localStorage. No credentials touch the tool. Redo it when the session expires.

## Metrics

Every run prints a short report and answers three questions.

```
DESIGN DIFF
────────────────────────

Visual match    83.5%

Diff bounds
x=0..1442
y=0..902
page coverage=100.0%
```

| Metric | What it tells you |
| --- | --- |
| **Visual match** | How many pixels line up. The headline score. |
| **Diff bounds** | The box enclosing every changed pixel, in CSS pixels. A tight box means one component is off, a box spanning the page points at a layout, viewport, or font problem. |
| **Page coverage** | How much of the page that box spans. Tells a local issue from a global one. |

The shape of the diff is the diagnosis. A tight box is one component off, a box spanning the page points at a font that never loaded or a viewport mismatch. Read the shape, not just the number.

The same numbers, plus the paths of every artifact, are written to `metrics.json` in the run folder for scripting.

```json
{
  "url": "http://localhost:3000",
  "matchPercent": 83.52,
  "diffPercent": 16.48,
  "changedPixels": 214326,
  "totalPixels": 1300684,
  "coveragePercent": 100,
  "diffBounds": { "x": 0, "y": 0, "width": 1442, "height": 902 },
  "readiness": { "fontsReady": true, "imagesComplete": true }
}
```

The overlay report draws the diff bounds as a box you can toggle on and off. Pass `--no-overlay` to skip the HTML report and heatmap when you only need the metrics.

Pass `--annotate` to also write `annotated.png`. The page screenshot with the diff box drawn on it. It needs no browser to view, so it drops straight into a PR comment or CI artifact. Nothing is written when there is no diff.

## Scripting and CI

Use `--json` to print only the result to stdout, and `--fail-under` to turn the
visual match into a pass/fail gate (exit 1 when below the threshold).

```sh
bunx design-diff http://localhost:3000 --png design.png --json --fail-under 98
```

`--fail-under` compares against **Visual match** (a percentage). It is separate
from `--threshold`, which sets how different a single pixel must be to count as
changed. `--threshold` is passed straight to
[pixelmatch](https://github.com/mapbox/pixelmatch): a pixel is flagged when its
YIQ-weighted colour distance from the design exceeds that fraction of the maximum
possible distance, so it is a perceptual metric, not raw Euclidean RGB. Lower is
stricter, `0` flags any difference at all, and `0.1` is the default.

For an agent the contract is simple. Read the JSON, act on `matchPercent` and `diffBounds`, run again, and stop when the score clears your bar.

## Programmatic API

The CLI is a thin wrapper around `designDiff`, which returns the same data it
writes to `metrics.json`, including the paths of every artifact.

```ts
import { designDiff } from "design-diff";

const result = await designDiff({
  url: "http://localhost:3000", // or actual: "screenshot.png" for image-vs-image
  design: "design.png", // or { fileKey, frameId }
  scale: 1,
  threshold: 0.1,
  ignore: [{ selector: "[data-dynamic]" }, { x: 24, y: 24, width: 48, height: 48 }],
  waitFor: ".hero-loaded",
});

if (result.matchPercent < 98) process.exit(1);
```

Running the tool in a loop? Reuse one browser instead of launching Chromium each
time.

```ts
import { designDiff, launchBrowser } from "design-diff";

const browser = await launchBrowser();
try {
  for (const url of urls) {
    await designDiff({ url, design: "design.png", browser });
  }
} finally {
  await browser.close();
}
```

## Limitations

- It compares pixels, not perception. Treat the score as a guide, not a verdict.
- Anti-aliasing and font rendering vary across machines, so a real page against a design export usually settles a point or two below 100 even when it looks right. Pick a threshold instead of chasing a perfect score.
- The design and the page must be the same size. A large mismatch is a hard error by design.
- A high score is necessary but not sufficient. A shifted component can still hide inside it, so keep the diff box and a human eye as the final check.

---

By [@planetabhi](https://planetabhi.com/) ⋛⋋( ⊙◊⊙)⋌⋚