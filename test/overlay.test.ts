import { describe, expect, test } from "bun:test";
import { renderOverlayHtml } from "../src/overlay.ts";

describe("renderOverlayHtml", () => {
  const html = renderOverlayHtml({
    designSrc: "design.png",
    domSrc: "dom.png",
    heatmapSrc: "heatmap.png",
    width: 2880,
    height: 1800,
    diffPercent: 3.14159,
  });

  test("embeds all three image layers", () => {
    expect(html).toContain('id="dom" src="dom.png"');
    expect(html).toContain('id="design" src="design.png"');
    expect(html).toContain('id="heat" src="heatmap.png"');
  });

  test("uses the frame dimensions and rounded diff", () => {
    expect(html).toContain("width: 2880px");
    expect(html).toContain("aspect-ratio: 2880 / 1800");
    expect(html).toContain("3.14%");
  });

  test("has reveal + opacity sliders, a drag handle, and a heatmap toggle", () => {
    expect(html).toContain('id="reveal"');
    expect(html).toContain('id="opacity"');
    expect(html).toContain('id="handle"');
    expect(html).toContain('id="heatBtn"');
  });

  test("does not shadow the global `top` binding", () => {
    expect(html).not.toContain("var top ");
    expect(html).not.toContain("const top ");
  });

  test("is a full HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});
