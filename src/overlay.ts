export interface OverlayInput {
  designSrc: string;
  domSrc: string;
  heatmapSrc: string;
  width: number;
  height: number;
  diffPercent: number;
  diffBounds?: DiffBoundsPct | null;
}

/** Diff bounding box as percentages of the frame, for CSS positioning. */
export interface DiffBoundsPct {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function renderOverlayHtml(input: OverlayInput): string {
  const { designSrc, domSrc, heatmapSrc, width, height, diffPercent, diffBounds } = input;
  const pct = diffPercent.toFixed(2);
  const diffColor = diffPercent > 1 ? "#ff8a80" : "#a5d6a7";
  const boundsStyle = diffBounds
    ? `left:${diffBounds.left.toFixed(4)}%;top:${diffBounds.top.toFixed(4)}%;width:${diffBounds.width.toFixed(4)}%;height:${diffBounds.height.toFixed(4)}%`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>design-diff overlay</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 14px system-ui, sans-serif; background: #111; color: #eee; }
  header {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 18px; align-items: center; flex-wrap: wrap;
    padding: 10px 14px; background: #1b1b1b; border-bottom: 1px solid #333;
  }
  header b { font-weight: 600; }
  label { display: inline-flex; gap: 8px; align-items: center; color: #aaa; }
  input[type=range] { width: 180px; }
  header button {
    background: #2a2a2a; color: #eee; border: 1px solid #444;
    border-radius: 6px; padding: 6px 10px; cursor: pointer;
  }
  header button[aria-pressed="true"] { background: #3d5afe; border-color: #3d5afe; }
  .right { margin-left: auto; display: inline-flex; gap: 14px; align-items: center; }
  .diff { color: ${diffColor}; }
  .stage { display: grid; place-items: center; padding: 16px; }
  .frame {
    position: relative; width: ${width}px; max-width: 100%;
    aspect-ratio: ${width} / ${height}; overflow: hidden;
    box-shadow: 0 0 0 1px #333; background: #fff;
  }
  .frame img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    display: block; user-select: none; -webkit-user-drag: none;
  }
  #heat { display: none; }
  #divider { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: #3d5afe; pointer-events: none; }
  #handle {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 26px; height: 26px; border-radius: 50%;
    background: #3d5afe; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5);
    cursor: ew-resize; pointer-events: auto; display: grid; place-items: center;
    color: #fff; font-size: 12px; touch-action: none;
  }
  #diffbox {
    position: absolute; border: 2px dashed #ffb300; box-shadow: 0 0 0 1px rgba(0,0,0,.4);
    pointer-events: none; box-sizing: border-box;
  }
</style>
</head>
<body>
<header>
  <b>design-diff</b>
  <label>Reveal <input id="reveal" type="range" min="0" max="100" value="50"></label>
  <label>Opacity <input id="opacity" type="range" min="0" max="100" value="100"></label>
  <span class="right">
    <span class="diff">diff ${pct}%</span>
    <button id="heatBtn" aria-pressed="false">Heatmap</button>
    ${boundsStyle ? `<button id="boundsBtn" aria-pressed="true">Bounds</button>` : ""}
  </span>
</header>
<div class="stage">
  <div class="frame" id="frame">
    <img id="dom" src="${domSrc}" alt="live page">
    <img id="design" src="${designSrc}" alt="design">
    <img id="heat" src="${heatmapSrc}" alt="pixel diff heatmap">
    ${boundsStyle ? `<div id="diffbox" style="${boundsStyle}"></div>` : ""}
    <div id="divider"><div id="handle" title="drag to reveal">↔</div></div>
  </div>
</div>
<script>
(function () {
  var design = document.getElementById('design');
  var heat = document.getElementById('heat');
  var divider = document.getElementById('divider');
  var handle = document.getElementById('handle');
  var frame = document.getElementById('frame');
  var reveal = document.getElementById('reveal');
  var opacity = document.getElementById('opacity');
  var heatBtn = document.getElementById('heatBtn');

  function apply() {
    var r = +reveal.value;
    design.style.clipPath = 'inset(0 ' + (100 - r) + '% 0 0)';
    design.style.opacity = (+opacity.value / 100).toFixed(2);
    divider.style.left = r + '%';
  }

  reveal.addEventListener('input', apply);
  opacity.addEventListener('input', apply);

  heatBtn.addEventListener('click', function () {
    var on = heat.style.display === 'block';
    heat.style.display = on ? 'none' : 'block';
    heatBtn.setAttribute('aria-pressed', String(!on));
  });

  var boundsBtn = document.getElementById('boundsBtn');
  var diffbox = document.getElementById('diffbox');
  if (boundsBtn && diffbox) {
    boundsBtn.addEventListener('click', function () {
      var on = diffbox.style.display !== 'none';
      diffbox.style.display = on ? 'none' : 'block';
      boundsBtn.setAttribute('aria-pressed', String(!on));
    });
  }

  var dragging = false;
  function setFromX(clientX) {
    var rect = frame.getBoundingClientRect();
    var pct = ((clientX - rect.left) / rect.width) * 100;
    reveal.value = String(Math.max(0, Math.min(100, Math.round(pct))));
    apply();
  }
  handle.addEventListener('pointerdown', function (e) {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', function (e) {
    if (dragging) setFromX(e.clientX);
  });
  handle.addEventListener('pointerup', function () { dragging = false; });

  apply();
})();
</script>
</body>
</html>
`;
}
