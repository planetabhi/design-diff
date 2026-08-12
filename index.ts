#!/usr/bin/env bun

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { PNG } from "pngjs";
import type { Geometry } from "./src/types.ts";
import { exportDesignFrame } from "./src/fetch/figma.ts";
import { screenshotPage } from "./src/fetch/dom.ts";
import { comparePixelDiff } from "./src/compare/pixel.ts";
import { renderOverlayHtml } from "./src/overlay.ts";

const USAGE = `design-diff — overlay a design on a live page

Usage:
  design-diff <url> --png <design.png> [options]
  design-diff <url> --file <fileKey> --frame <nodeId> [options]

Design source (one required):
  --png <path>        Local design export (PNG). Viewport is derived from it.
  --file <key>        Figma file key + --frame to fetch the export via the API.
  --frame <nodeId>    Figma frame node-id (from the frame's URL, e.g. 10-2).

Options:
  --scale <n>         Design export scale (1 for 1x, 2 for retina; default 1).
  --threshold <0..1>  pixelmatch matching threshold (default 0.1).
  --auth <path>       Playwright storageState JSON for pages behind login.
  --out <dir>         Output dir (default .design-diff).
  --open              Open the report when done.
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
  const a: Args = { scale: 1, threshold: 0.1, out: ".design-diff", open: false, help: false };
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
if (
  !Number.isFinite(args.threshold) ||
  args.threshold < 0 ||
  args.threshold > 1
) {
  fail("--threshold must be between 0 and 1");
}
if (!args.png && !(args.file && args.frame)) {
  fail("provide a design source: --png <path>, or --file <key> --frame <nodeId>");
}

await run().catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

async function run(): Promise<void> {
  if (args.png && !existsSync(args.png)) throw new Error(`design not found: ${resolve(args.png)}`);
  if (args.auth && !existsSync(args.auth)) throw new Error(`auth file not found: ${resolve(args.auth)}`);

  const runDir = join(args.out, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  const designPng = join(runDir, "design.png");
  const domPng = join(runDir, "dom.png");
  const heatmapPng = join(runDir, "heatmap.png");
  const htmlPath = join(runDir, "overlay.html");

  let box: Geometry;
  if (args.png) {
    let png: PNG;
    try {
      png = PNG.sync.read(readFileSync(args.png));
    } catch {
      throw new Error(`${args.png} is not a readable PNG`);
    }
    copyFileSync(args.png, designPng);
    box = { x: 0, y: 0, w: png.width / args.scale, h: png.height / args.scale };
  } else {
    ({ box } = await exportDesignFrame(args.file!, args.frame!, args.scale, designPng));
  }

  const shot = await screenshotPage({
    url: args.url!,
    size: { w: box.w, h: box.h },
    deviceScaleFactor: args.scale,
    outPath: domPng,
    authStateRef: args.auth,
  });

  const pixel = comparePixelDiff({
    designPngPath: designPng,
    pagePngPath: domPng,
    heatmapPath: heatmapPng,
    scale: args.scale,
    threshold: args.threshold,
  });

  writeFileSync(
    htmlPath,
    renderOverlayHtml({
      designSrc: basename(designPng),
      domSrc: basename(domPng),
      heatmapSrc: basename(heatmapPng),
      width: shot.width,
      height: shot.height,
      diffPercent: pixel.diffPercent,
    })
  );

  console.log(`overlay:     ${htmlPath}`);
  console.log(`diffPercent: ${pixel.diffPercent.toFixed(2)}%`);
  if (!shot.readiness.fontsReady) console.warn("warning: web fonts were not fully loaded");
  if (args.open) openFile(htmlPath);
}
