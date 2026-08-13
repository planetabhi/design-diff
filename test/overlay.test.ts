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

describe("renderOverlayHtml with diff bounds", () => {
  test("renders the bounds box and toggle when bounds are given", () => {
    const html = renderOverlayHtml({
      designSrc: "design.png",
      domSrc: "dom.png",
      heatmapSrc: "heatmap.png",
      width: 1000,
      height: 500,
      diffPercent: 5,
      diffBounds: { left: 10, top: 20, width: 30, height: 40 },
    });
    expect(html).toContain('id="diffbox"');
    expect(html).toContain("left:10.0000%");
    expect(html).toContain("height:40.0000%");
    expect(html).toContain('id="boundsBtn"');
  });

  test("omits the bounds box when there are no bounds", () => {
    const html = renderOverlayHtml({
      designSrc: "design.png",
      domSrc: "dom.png",
      heatmapSrc: "heatmap.png",
      width: 1000,
      height: 500,
      diffPercent: 0,
      diffBounds: null,
    });
    expect(html).not.toContain('id="diffbox"');
    expect(html).not.toContain('id="boundsBtn"');
  });
});
