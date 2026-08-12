import { describe, expect, test } from "bun:test";
import { renderSliderHtml } from "../src/overlay.ts";

describe("renderSliderHtml", () => {
  const html = renderSliderHtml({
    designSrc: "design.png",
    domSrc: "dom.png",
    heatmapSrc: "heatmap.png",
    width: 2880,
    height: 1800,
    diffPercent: 3.14159,
  });

  test("embeds both image sources and the heatmap", () => {
    expect(html).toContain('src="design.png"');
    expect(html).toContain('data-dom="dom.png"');
    expect(html).toContain('data-heat="heatmap.png"');
  });

  test("uses the frame dimensions and rounded diff", () => {
    expect(html).toContain("width: 2880px");
    expect(html).toContain("aspect-ratio: 2880 / 1800");
    expect(html).toContain("3.14%");
  });

  test("has a slider and heatmap toggle", () => {
    expect(html).toContain('type="range"');
    expect(html).toContain('id="heat"');
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});
