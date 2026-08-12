// Figma frame export: fetch the frame's box and render it to a PNG (view-only).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Geometry } from "../types.ts";
import { getFigmaToken } from "../auth/token.ts";

const FIGMA_API = "https://api.figma.com/v1";
const MAX_RETRIES = 4;

interface FigmaNode {
  id: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: FigmaNode[];
}

async function figmaGet(path: string, token: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${FIGMA_API}${path}`, { headers: { "X-Figma-Token": token } });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Figma API ${res.status} ${res.statusText} for ${path}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
  }
}

// Figma REST uses `10:2`; the URL's node-id is `10-2`. Accept either.
function normalizeId(nodeId: string): string {
  return nodeId.replace(/-/g, ":");
}

export interface FrameExport {
  box: Geometry; // frame size in CSS px (origin 0,0)
}

/** Export a single Figma frame to `outPath` and return its CSS-px size. */
export async function exportDesignFrame(
  fileKey: string,
  frameNodeId: string,
  scale: number,
  outPath: string
): Promise<FrameExport> {
  const token = getFigmaToken();
  const id = normalizeId(frameNodeId);

  const data = await figmaGet(
    `/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(id)}`,
    token
  );
  const node: FigmaNode | undefined = data.nodes?.[id]?.document;
  if (!node) throw new Error(`frame node-id "${frameNodeId}" not found in file`);
  const b = node.absoluteBoundingBox;
  if (!b) throw new Error(`frame "${frameNodeId}" has no bounding box`);

  const png = await exportNodePng(fileKey, node.id, scale, token);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);

  return { box: { x: 0, y: 0, w: b.width, h: b.height } };
}

/** Render a node to PNG via the Figma image export endpoint, polling until ready. */
async function exportNodePng(
  fileKey: string,
  nodeId: string,
  scale: number,
  token: string
): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    const data = await figmaGet(
      `/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png`,
      token
    );
    if (data.err) throw new Error(`Figma image export error: ${data.err}`);
    const url: string | null | undefined = data.images?.[nodeId];
    if (url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`image download failed: ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (attempt >= MAX_RETRIES) throw new Error(`image export not ready for node ${nodeId}`);
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
  }
}
