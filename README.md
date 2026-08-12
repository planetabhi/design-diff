# design-diff

Compare your running page against the design to find visual differences.

A CLI that overlays a design export on a screenshot of your page. Move a slider to compare them side by side, lower the opacity to see one on top of the other, or view a pixel diff to see exactly which pixels differ.

## Usage

```sh
# local design export
bunx design-diff http://localhost:3000 --png design.png --scale 1 --open

# or pull the export from Figma
bunx design-diff http://localhost:3000 --file <fileKey> --frame <node-id> --scale 1 --open
```

The first run downloads Chromium once, then every run is instant. Needs [Bun](https://bun.sh).

```
--png <path>        Design export (PNG) to compare against.
--file <key>        Figma file key — use with --frame instead of --png.
--frame <node-id>   Figma frame to export (from the frame's URL).
--scale <n>         Match the export: 1 for 1x, 2 for retina (default 1).
--threshold <0..1>  Pixel-diff sensitivity (default 0.1).
--auth <path>       Playwright storageState for pages behind login.
--out <dir>         Where the report is written (default .design-diff).
--open              Open the report when done.
```

## How it works

The design PNG sets the size, the page is screenshotted at the same pixel dimensions, so the two line up exactly. It waits for fonts and images to load and turns off animations before capturing.

With `--file/--frame`, it pulls the frame's size and PNG from the Figma API instead (needs `DESIGN_DIFF_FIGMA_TOKEN`).

## Pages behind login

Save a logged-in session once, then pass it with `--auth`:

```sh
bunx playwright codegen --save-storage=auth.json https://your-app/login

# log in in the window, then close it
bunx design-diff https://your-app/dashboard --png design.png --auth auth.json --open
```

`auth.json` holds cookies and localStorage — no credentials touch the tool. Redo it when the session expires.

---

By [@planetabhi](https://planetabhi.com/) ⋛⋋( ⊙◊⊙)⋌⋚