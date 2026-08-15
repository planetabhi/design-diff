import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const dir = join(".design-diff", "test-cli");
const designPath = join(dir, "design.png");
const samePath = join(dir, "same.png");
const changedPath = join(dir, "changed.png");

function solid(w: number, h: number, rgba: [number, number, number, number]): PNG {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return png;
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const res = Bun.spawnSync([process.execPath, "index.ts", ...args]);
  return {
    code: res.exitCode,
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
  };
}

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  const design = solid(20, 10, [255, 255, 255, 255]);
  const changed = solid(20, 10, [255, 255, 255, 255]);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 20 + x) * 4;
      changed.data[i] = 255;
      changed.data[i + 1] = 0;
      changed.data[i + 2] = 0;
      changed.data[i + 3] = 255;
    }
  }
  writeFileSync(designPath, PNG.sync.write(design));
  writeFileSync(samePath, PNG.sync.write(solid(20, 10, [255, 255, 255, 255])));
  writeFileSync(changedPath, PNG.sync.write(changed));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("cli", () => {
  test("--json emits metrics including artifact paths", () => {
    const { code, stdout } = run(["--actual", samePath, "--png", designPath, "--out", dir, "--json"]);
    expect(code).toBe(0);
    const metrics = JSON.parse(stdout);
    expect(metrics.matchPercent).toBe(100);
    expect(metrics.paths.metrics).toContain("metrics.json");
  });

  test("--no-overlay omits overlay and heatmap paths", () => {
    const { code, stdout } = run([
      "--actual", changedPath, "--png", designPath, "--out", dir, "--no-overlay", "--json",
    ]);
    expect(code).toBe(0);
    const metrics = JSON.parse(stdout);
    expect(metrics.paths.overlay).toBeUndefined();
    expect(metrics.paths.heatmap).toBeUndefined();
  });

  test("--fail-under exits 1 when the match is below the bar", () => {
    const { code } = run([
      "--actual", changedPath, "--png", designPath, "--out", dir, "--json", "--fail-under", "100",
    ]);
    expect(code).toBe(1);
  });

  test("--ignore masks a region so the diff clears", () => {
    const { code, stdout } = run([
      "--actual", changedPath, "--png", designPath, "--out", dir, "--json",
      "--ignore", "0,0,4,4",
    ]);
    expect(code).toBe(0);
    const metrics = JSON.parse(stdout);
    expect(metrics.matchPercent).toBe(100);
  });

  test("a flag with a missing value fails clearly instead of swallowing the next flag", () => {
    const { code, stderr } = run(["--actual", samePath, "--png", "--json", "--out", dir]);
    expect(code).toBe(1);
    expect(stderr).toContain("--png expects a value");
  });

  test("supports --flag=value syntax", () => {
    const { code, stdout } = run([
      "--actual=" + samePath, "--png=" + designPath, "--out=" + dir, "--json",
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).matchPercent).toBe(100);
  });
});
