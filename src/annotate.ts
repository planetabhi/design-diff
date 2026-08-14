import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import type { DiffBounds } from "./compare/pixel.ts";

export interface AnnotateOptions {
  pagePngPath: string;
  outPath: string;
  /** Diff box in CSS pixels. */
  bounds: DiffBounds;
  /** CSS-px -> device-px multiplier (1 in image mode). */
  scale: number;
  /** RGB border colour; defaults to the overlay's amber. */
  color?: [number, number, number];
}

const DEFAULT_COLOR: [number, number, number] = [255, 179, 0];

/** Draw the diff bounds onto a copy of the page screenshot. */
export function writeAnnotatedPng(opts: AnnotateOptions): void {
  const png = PNG.sync.read(readFileSync(opts.pagePngPath));
  const color = opts.color ?? DEFAULT_COLOR;
  const thickness = Math.max(2, Math.round(2 * opts.scale));

  const x0 = clamp(Math.round(opts.bounds.x * opts.scale), 0, png.width);
  const y0 = clamp(Math.round(opts.bounds.y * opts.scale), 0, png.height);
  const x1 = clamp(Math.round((opts.bounds.x + opts.bounds.width) * opts.scale), 0, png.width);
  const y1 = clamp(Math.round((opts.bounds.y + opts.bounds.height) * opts.scale), 0, png.height);

  for (let t = 0; t < thickness; t++) {
    fillRow(png, x0, x1, y0 + t, color);
    fillRow(png, x0, x1, y1 - 1 - t, color);
    fillCol(png, y0, y1, x0 + t, color);
    fillCol(png, y0, y1, x1 - 1 - t, color);
  }

  mkdirSync(dirname(opts.outPath), { recursive: true });
  writeFileSync(opts.outPath, PNG.sync.write(png));
}

function paint(png: PNG, x: number, y: number, color: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = color[0];
  png.data[i + 1] = color[1];
  png.data[i + 2] = color[2];
  png.data[i + 3] = 255;
}

function fillRow(png: PNG, x0: number, x1: number, y: number, color: [number, number, number]): void {
  for (let x = x0; x < x1; x++) paint(png, x, y, color);
}

function fillCol(png: PNG, y0: number, y1: number, x: number, color: [number, number, number]): void {
  for (let y = y0; y < y1; y++) paint(png, x, y, color);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
