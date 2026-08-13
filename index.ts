#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { designDiff, metricsOf, type DesignDiffResult } from "./src/core.ts";
import type { IgnoreRegion } from "./src/compare/pixel.ts";

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
  --ignore <x,y,w,h>  Rectangle (CSS px) to exclude from the diff. Repeatable.
  --fail-under <pct>  Exit 1 when the visual match is below this percentage.
  --json              Print the result as JSON to stdout and nothing else.
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
  ignore: IgnoreRegion[];
  failUnder?: number;
  json: boolean;
  open: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    scale: 1,
    threshold: 0.1,
    out: ".design-diff",
    ignore: [],
    json: false,
    open: false,
    help: false,
  };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    switch (t) {
      case "-h":
      case "--help": a.help = true; break;
      case "--open": a.open = true; break;
      case "--json": a.json = true; break;
      case "--png": a.png = argv[++i]; break;
      case "--file": a.file = argv[++i]; break;
      case "--frame": a.frame = argv[++i]; break;
      case "--scale": a.scale = Number(argv[++i]); break;
      case "--threshold": a.threshold = Number(argv[++i]); break;
      case "--fail-under": a.failUnder = Number(argv[++i]); break;
      case "--ignore": a.ignore.push(parseIgnore(argv[++i])); break;
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

function parseIgnore(spec: string | undefined): IgnoreRegion {
  const parts = (spec ?? "").split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    fail(`--ignore expects x,y,w,h (got "${spec ?? ""}")`);
  }
  const [x, y, width, height] = parts as [number, number, number, number];
  return { x, y, width, height };
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
if (args.failUnder !== undefined && (!Number.isFinite(args.failUnder) || args.failUnder < 0 || args.failUnder > 100)) {
  fail("--fail-under must be between 0 and 100");
}
if (!args.png && !(args.file && args.frame)) {
  fail("provide a design source: --png <path>, or --file <key> --frame <nodeId>");
}

await run().catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

async function run(): Promise<void> {
  const result = await designDiff({
    url: args.url!,
    design: args.png ? args.png : { fileKey: args.file!, frameId: args.frame! },
    scale: args.scale,
    threshold: args.threshold,
    auth: args.auth,
    outDir: args.out,
    ignore: args.ignore.length ? args.ignore : undefined,
  });

  if (args.json) {
    console.log(JSON.stringify(metricsOf(result), null, 2));
  } else {
    console.log(formatReport(result));
    console.log(`\noverlay: ${result.paths.overlay}`);
    console.log(`metrics: ${result.paths.metrics}`);
    if (!result.readiness.fontsReady) console.warn("warning: web fonts were not fully loaded");
    if (args.open) openFile(result.paths.overlay);
  }

  if (args.failUnder !== undefined && result.matchPercent < args.failUnder) {
    process.exit(1);
  }
}

function formatReport(r: DesignDiffResult): string {
  const lines = ["DESIGN DIFF", "────────────────────────", "", `Visual match    ${r.matchPercent.toFixed(1)}%`];
  if (r.diffBounds) {
    const b = r.diffBounds;
    lines.push(
      "",
      "Diff bounds",
      `x=${b.x}..${b.x + b.width}`,
      `y=${b.y}..${b.y + b.height}`,
      `page coverage=${r.coveragePercent.toFixed(1)}%`
    );
  } else {
    lines.push("", "No differences.");
  }
  return lines.join("\n");
}

