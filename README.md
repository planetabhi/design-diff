# design-diff

A CLI that overlays your design on the live page so you can see what's off.

Give it a design export (a PNG) and a URL. It screenshots the page at the same size and writes a self-contained `overlay.html` with a draggable before/after slider and a pixel-diff heatmap. No ids, no attributes, no markup changes.

## What you get

- **`overlay.html`** — drag the slider: left of the line is the design, right is the live page.
- **Heatmap toggle** — highlights where pixels differ.
- **`diffPercent`** — a rough number for how much differs.

It's a review aid for your eyes, not a pass/fail gate. Text and anti-aliasing always differ a little between a design tool and a browser; the slider lets you look past that, which an automated score can't.

## Usage

```sh
# from a local design export (any tool: Figma, Sketch, a screenshot)
design-diff http://localhost:3000 --png hero@2x.png

# or fetch the export straight from Figma (view access is enough)
design-diff http://localhost:3000 --file <fileKey> --frame 10-2
```

Then open the `overlay.html` it prints (or pass `--open`).

```
--png <path>        Local design export. The viewport is derived from it.
--file <key>        Figma file key + --frame to fetch via the API.
--frame <nodeId>    Figma frame node-id (from the frame's URL, e.g. 10-2).
--scale <n>         Export scale = screenshot DPR (default 2).
--threshold <0..1>  pixelmatch threshold (default 0.1).
--auth <path>       Playwright storageState JSON for pages behind login.
--out <dir>         Output dir (default .design-diff).
--open              Open the resulting overlay.html.
```

## How it works

The design PNG defines the size. If it was exported at scale `S`, its pixel size is `frame × S`, so the page is screenshotted at `pngWidth/S × pngHeight/S` with `deviceScaleFactor = S`. Both images end up identical pixel dimensions, so they line up. The page is captured after fonts load, images finish, the network goes idle, and animations are disabled.

With `--file/--frame` instead of `--png`, it fetches the frame's size and PNG from the Figma API (needs `DESIGN_DIFF_FIGMA_TOKEN`, view access is enough).

## Setup

Requires [Bun](https://bun.sh) — the CLI runs TypeScript directly.

```sh
bun install
bunx playwright-core install chromium   # one-time, for the screenshot
```

## Scope

One design vs one URL per run, at a single size. Pages taller or shorter than the design are clipped to its box. Pages behind login: pass a Playwright `storageState` path via `--auth`.
