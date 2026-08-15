import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { exportDesignFrame } from "../src/fetch/figma.ts";

const NODE_ID = "10:2";
const FRAME_ID = "10-2";
const IMG_URL = "https://figma-exports.example/img.png";

const dir = join(".design-diff", "test-figma");
mkdirSync(dir, { recursive: true });
const pngBytes = PNG.sync.write(new PNG({ width: 4, height: 4 }));
const originalFetch = globalThis.fetch;
const originalToken = process.env.DESIGN_DIFF_FIGMA_TOKEN;
process.env.DESIGN_DIFF_FIGMA_TOKEN = "test-token";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function happyDispatcher(url: string): Response {
  if (url.includes("/files/")) {
    return json({ nodes: { [NODE_ID]: { document: { id: NODE_ID, absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 } } } } });
  }
  if (url.includes("/images/")) {
    return json({ images: { [NODE_ID]: IMG_URL } });
  }
  return new Response(new Uint8Array(pngBytes), { status: 200 });
}

describe("exportDesignFrame", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalToken === undefined) delete process.env.DESIGN_DIFF_FIGMA_TOKEN;
    else process.env.DESIGN_DIFF_FIGMA_TOKEN = originalToken;
  });

  test("returns the frame box and writes the exported png", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      happyDispatcher(String(input))) as unknown as typeof fetch;

    const out = join(dir, "design.png");
    const res = await exportDesignFrame("KEY", FRAME_ID, 1, out);
    expect(res.box).toEqual({ x: 0, y: 0, w: 400, h: 200 });
    const png = PNG.sync.read(readFileSync(out));
    expect(png.width).toBe(4);
  });

  test("maps 404 to a clear file-not-found error", async () => {
    globalThis.fetch = (async () =>
      new Response("not found", { status: 404, statusText: "Not Found" })) as unknown as typeof fetch;
    await expect(exportDesignFrame("KEY", FRAME_ID, 1, join(dir, "x.png"))).rejects.toThrow(
      /file not found/
    );
  });

  test("maps 401/403 to an auth error", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 403, statusText: "Forbidden" })) as unknown as typeof fetch;
    await expect(exportDesignFrame("KEY", FRAME_ID, 1, join(dir, "x.png"))).rejects.toThrow(
      /invalid or lacks access/
    );
  });

  test("retries on 429 honouring Retry-After, then succeeds", async () => {
    let filesCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/files/")) {
        filesCalls++;
        if (filesCalls === 1) {
          return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
        }
      }
      return happyDispatcher(url);
    }) as unknown as typeof fetch;

    const res = await exportDesignFrame("KEY", FRAME_ID, 1, join(dir, "retry.png"));
    expect(filesCalls).toBe(2);
    expect(res.box.w).toBe(400);
  });
});
