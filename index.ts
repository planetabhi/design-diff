#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { designDiff, metricsOf, type DesignDiffResult, type IgnoreInput, type IgnoreRegion } from "./src/core.ts";

const USAGE = `design-diff — overlay a design on a live page

Usage:
  design-diff <url> --png <design.png> [options]
  design-diff <url> --file <fileKey> --frame <nodeId> [options]
  design-diff --actual <page.png> --png <design.png> [options]

Design source (one required):
  --png <path>        Local design export (PNG). Viewport is derived from it.
  --file <key>        Figma file key + --frame to fetch the export via the API.
  --frame <nodeId>    Figma frame node-id (from the frame's URL, e.g. 10-2).

Options:
  --actual <path>     Compare a local PNG instead of screenshotting a url.
  --scale <n>         Design export scale (1 for 1x, 2 for retina; default 1).
  --threshold <0..1>  pixelmatch matching threshold (default 0.1).
  --auth <path>       Playwright storageState JSON for pages behind login.
  --out <dir>         Output dir (default .design-diff).
  --ignore <x,y,w,h>  Rectangle (CSS px) to exclude from the diff. Repeatable.
  --ignore-selector <sel>  CSS selector whose elements are masked. Repeatable.
  --wait-for <sel>    Wait for this selector before capturing. Repeatable.
  --no-overlay        Skip writing overlay.html and heatmap.png.
  --annotate          Also write annotated.png with the diff box drawn on it.
  --fail-under <pct>  Exit 1 when the visual match is below this percentage.
  --json              Print the result as JSON to stdout and nothing else.
  --open              Open the report when done.
  -h, --help          Show this help.
  -v, --version       Print the version.

The Figma API path needs DESIGN_DIFF_FIGMA_TOKEN (view access is enough).`;

interface Args {
  url?: string;
  actual?: string;
  png?: string;
  file?: string;
  frame?: string;
  scale: number;
  threshold: number;
  auth?: string;
  out: string;
  ignore: IgnoreRegion[];
  ignoreSelectors: string[];
  waitFor: string[];
  noOverlay: boolean;
  annotate: boolean;
  failUnder?: number;
  json: boolean;
  open: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    scale: 1,
    threshold: 0.1,
    out: ".design-diff",
    ignore: [],
    ignoreSelectors: [],
    waitFor: [],
    noOverlay: false,
    annotate: false,
    json: false,
    open: false,
    help: false,
    version: false,
  };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    // Support --flag=value alongside space-separated --flag value.
    let name = t;
    let inline: string | undefined;
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      if (eq !== -1) {
        name = t.slice(0, eq);
        inline = t.slice(eq + 1);
      }
    }
    // Consume this flag's value, rejecting a missing value or a following flag.
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) fail(`${name} expects a value`);
      return next;
    };
    switch (name) {
      case "-h":
      case "--help": a.help = true; break;
      case "-v":
      case "--version": a.version = true; break;
      case "--open": a.open = true; break;
      case "--json": a.json = true; break;
      case "--no-overlay": a.noOverlay = true; break;
      case "--annotate": a.annotate = true; break;
      case "--png": a.png = value(); break;
      case "--actual": a.actual = value(); break;
      case "--file": a.file = value(); break;
      case "--frame": a.frame = value(); break;
      case "--scale": a.scale = Number(value()); break;
      case "--threshold": a.threshold = Number(value()); break;
      case "--fail-under": a.failUnder = Number(value()); break;
      case "--ignore": a.ignore.push(parseIgnore(value())); break;
      case "--ignore-selector": a.ignoreSelectors.push(value()); break;
      case "--wait-for": a.waitFor.push(value()); break;
      case "--auth": a.auth = value(); break;
      case "--out": a.out = value(); break;
      default:
        if (t.startsWith("--")) fail(`unknown option ${name}`);
        positionals.push(t);
    }
  }
  a.url = positionals[0];
  return a;
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function parseIgnore(spec: string | undefined): IgnoreRegion {
  const parts = (spec ?? "").split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    fail(`--ignore expects x,y,w,h (got "${spec ?? ""}")`);
  }
  // SAFETY: the guard above proves parts holds exactly four finite numbers.
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
if (args.version) {
  console.log(readVersion());
  process.exit(0);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!args.url && !args.actual) fail("provide a <url> or --actual <image>");
if (args.url && args.actual) fail("provide either a <url> or --actual <image>, not both");
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
  const ignore: IgnoreInput[] = [
    ...args.ignore,
    ...args.ignoreSelectors.map((selector) => ({ selector })),
  ];
  const result = await designDiff({
    url: args.url,
    actual: args.actual,
    design: args.png ? args.png : { fileKey: args.file!, frameId: args.frame! },
    scale: args.scale,
    threshold: args.threshold,
    auth: args.auth,
    outDir: args.out,
    ignore: ignore.length ? ignore : undefined,
    waitFor: args.waitFor.length ? args.waitFor : undefined,
    writeOverlay: !args.noOverlay,
    writeAnnotated: args.annotate,
  });

  if (args.json) {
    console.log(JSON.stringify(metricsOf(result), null, 2));
    if (args.open) console.warn("warning: --open is ignored with --json");
  } else {
    console.log(formatReport(result));
    if (result.paths.overlay) console.log(`\noverlay: ${result.paths.overlay}`);
    if (result.paths.annotated) console.log(`annotated: ${result.paths.annotated}`);
    console.log(`metrics: ${result.paths.metrics}`);
    if (result.readiness && !result.readiness.fontsReady) console.warn("warning: web fonts were not fully loaded");
    if (args.open && result.paths.overlay) openFile(result.paths.overlay);
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

