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

interface FigmaNodesResponse {
  nodes?: Record<string, { document?: FigmaNode } | undefined>;
}

interface FigmaImagesResponse {
  err?: string | null;
  images?: Record<string, string | null | undefined>;
}

// Honour a Retry-After header (delta-seconds or HTTP date), else exponential backoff.
function backoffMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, 15000);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), 15000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function figmaGet<T>(path: string, token: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${FIGMA_API}${path}`, { headers: { "X-Figma-Token": token } });
    // SAFETY: these Figma REST endpoints return the fields declared by the caller's response
    // type (FigmaNodesResponse / FigmaImagesResponse); every accessed field is guarded downstream.
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Figma API ${res.status}: DESIGN_DIFF_FIGMA_TOKEN is invalid or lacks access to this file`);
      }
      if (res.status === 404) throw new Error("Figma API 404: file not found — check the --file key");
      throw new Error(`Figma API ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, backoffMs(res, attempt)));
  }
}

function normalizeId(nodeId: string): string {
  return nodeId.replace(/-/g, ":");
}

export interface FrameExport {
  box: Geometry;
}

export async function exportDesignFrame(
  fileKey: string,
  frameNodeId: string,
  scale: number,
  outPath: string
): Promise<FrameExport> {
  const token = getFigmaToken();
  const id = normalizeId(frameNodeId);

  const data = await figmaGet<FigmaNodesResponse>(
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

async function exportNodePng(
  fileKey: string,
  nodeId: string,
  scale: number,
  token: string
): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    const data = await figmaGet<FigmaImagesResponse>(
      `/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png`,
      token
    );
    if (data.err) throw new Error(`Figma image export error: ${data.err}`);
    const url: string | null | undefined = data.images?.[nodeId];
    if (url) return downloadImage(url);
    if (attempt >= MAX_RETRIES) throw new Error(`image export not ready for node ${nodeId}`);
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`image download failed: ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, backoffMs(res, attempt)));
  }
}
