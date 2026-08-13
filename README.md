# design-diff

A CLI and library that overlays a design export on a screenshot of your page. Move a slider to compare them side by side, lower the opacity to see one on top of the other, or view a pixel diff to see exactly which pixels differ.

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
--scale <n>         Match the export: 1 for 1x, 2 for retina (default 1).
--threshold <0..1>  Pixel-diff sensitivity (default 0.1).
--auth <path>       Playwright storageState for pages behind login.
--out <dir>         Where the report is written (default .design-diff).
--ignore <x,y,w,h>  Rectangle (CSS px) to exclude from the diff. Repeatable.
--ignore-selector <sel>  CSS selector whose elements are masked. Repeatable.
--wait-for <sel>    Wait for this selector before capturing. Repeatable.
--no-overlay        Skip writing overlay.html and heatmap.png.
--fail-under <pct>  Exit 1 when the visual match is below this percentage.
--json              Print the result as JSON to stdout and nothing else.
--open              Open the report when done.
```

## How it works

The design PNG sets the size, the page is screenshotted at the same pixel dimensions, so the two line up exactly. It waits for fonts and images to load and turns off animations before capturing.

With `--file/--frame`, it pulls the frame's size and PNG from the Figma API instead (needs `DESIGN_DIFF_FIGMA_TOKEN`).

Use `--ignore` to mask dynamic regions (avatars, timestamps) so they never count as differences. Coordinates are CSS pixels, repeat the flag for multiple boxes. Prefer `--ignore-selector` when the region moves or resizes — every element matching the selector is masked by its live bounding box.

```sh
bunx design-diff http://localhost:3000 --png design.png \
  --ignore 24,24,48,48 --ignore-selector "[data-dynamic], time"
```

Use `--wait-for` to hold the capture until a selector appears, removing most “still loading” flakes. It errors if the selector never shows within 15s.

```sh
bunx design-diff http://localhost:3000 --png design.png --wait-for ".hero-loaded"
```

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


The same numbers are written to `metrics.json` in the run folder for scripting:

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

## Scripting and CI

Use `--json` to print only the result to stdout, and `--fail-under` to turn the
visual match into a pass/fail gate (exit 1 when below the threshold).

```sh
bunx design-diff http://localhost:3000 --png design.png --json --fail-under 98
```

`--fail-under` compares against **Visual match** (a percentage). It is separate
from `--threshold`, which is the per-pixel colour sensitivity.

## Programmatic API

The CLI is a thin wrapper around `designDiff`, which returns the same data it
writes to `metrics.json` plus the paths of every artifact.

```ts
import { designDiff } from "design-diff";

const result = await designDiff({
  url: "http://localhost:3000",
  design: "design.png", // or { fileKey, frameId }
  scale: 1,
  threshold: 0.1,
  ignore: [{ x: 24, y: 24, width: 48, height: 48 }],
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

---

By [@planetabhi](https://planetabhi.com/) ⋛⋋( ⊙◊⊙)⋌⋚