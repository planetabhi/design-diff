#!/usr/bin/env bun
// design-diff CLI — overlay a design PNG (or a Figma frame) on a live page.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { PNG } from "pngjs";
import type { Geometry } from "./src/types.ts";
import { exportDesignFrame } from "./src/fetch/figma.ts";
import { screenshotPage } from "./src/fetch/dom.ts";
import { comparePixelDiff } from "./src/compare/pixel.ts";
import { renderSliderHtml } from "./src/overlay.ts";

const USAGE = `design-diff — overlay a design on a live page

Usage:
  design-diff <url> --png <design.png> [options]
  design-diff <url> --file <fileKey> --frame <nodeId> [options]

Design source (one required):
  --png <path>        Local design export (PNG). Viewport is derived from it.
  --file <key>        Figma file key + --frame to fetch the export via the API.
  --frame <nodeId>    Figma frame node-id (from the frame's URL, e.g. 10-2).

Options:
  --scale <n>         Export scale = screenshot DPR (default 2).
  --threshold <0..1>  pixelmatch matching threshold (default 0.1).
  --auth <path>       Playwright storageState JSON for pages behind login.
  --out <dir>         Output dir (default .design-diff).
  --open              Open the resulting overlay.html.
  -h, --help          Show this help.

The Figma API path needs DESIGN_DIFF_FIGMA_TOKEN (view access is enough).`;

interface Args {
  url?: string;
  png?: string;
  file?: string;
  frame?: string;
  scale: number;
  threshold: number;
  auth?: string;
  out: string;
  open: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { scale: 2, threshold: 0.1, out: ".design-diff", open: false, help: false };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    switch (t) {
      case "-h":
      case "--help": a.help = true; break;
      case "--open": a.open = true; break;
      case "--png": a.png = argv[++i]; break;
      case "--file": a.file = argv[++i]; break;
      case "--frame": a.frame = argv[++i]; break;
      case "--scale": a.scale = Number(argv[++i]); break;
      case "--threshold": a.threshold = Number(argv[++i]); break;
      case "--auth": a.auth = argv[++i]; break;
      case "--out": a.out = argv[++i] ?? a.out; break;
      default:
        if (t.startsWith("--")) fail(`unknown option ${t}`);
        positionals.push(t);
    }
  }
  a.url = positionals[0];
  return a;
}

function fail(msg: string): never {
  console.error(`error: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

function openFile(path: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [path], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!args.url) fail("missing <url>");
if (!Number.isFinite(args.scale) || args.scale <= 0) fail("--scale must be a positive number");
if (!args.png && !(args.file && args.frame)) {
  fail("provide a design source: --png <path>, or --file <key> --frame <nodeId>");
}

const runDir = join(args.out, new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(runDir, { recursive: true });
const designPng = join(runDir, "design.png");
const domPng = join(runDir, "dom.png");
const heatmapPng = join(runDir, "heatmap.png");
const htmlPath = join(runDir, "overlay.html");

// Resolve the design PNG + its CSS-px box (viewport for the screenshot).
let box: Geometry;
if (args.png) {
  const png = PNG.sync.read(readFileSync(args.png));
  copyFileSync(args.png, designPng);
  box = { x: 0, y: 0, w: png.width / args.scale, h: png.height / args.scale };
} else {
  ({ box } = await exportDesignFrame(args.file!, args.frame!, args.scale, designPng));
}

const shot = await screenshotPage({
  url: args.url,
  size: { w: box.w, h: box.h },
  deviceScaleFactor: args.scale,
  outPath: domPng,
  authStateRef: args.auth,
});

const pixel = comparePixelDiff({
  figmaPngPath: designPng,
  domPngPath: domPng,
  heatmapPath: heatmapPng,
  scale: args.scale,
  clip: { w: box.w, h: box.h },
  aaThreshold: args.threshold,
  ignoreRegions: [],
});

writeFileSync(
  htmlPath,
  renderSliderHtml({
    designSrc: basename(designPng),
    domSrc: basename(domPng),
    heatmapSrc: basename(heatmapPng),
    width: shot.width,
    height: shot.height,
    diffPercent: pixel.diffPercent,
  })
);

console.log(`overlay:    ${htmlPath}`);
console.log(`diffPercent: ${pixel.diffPercent.toFixed(2)}%`);
if (!shot.readiness.fontsReady) console.warn("warning: web fonts were not fully loaded");
if (args.open) openFile(htmlPath);
