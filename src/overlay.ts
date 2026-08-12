// Self-contained before/after slider (design vs live page) + heatmap toggle. Pure.

export interface OverlayInput {
  designSrc: string; // relative image path
  domSrc: string;
  heatmapSrc: string;
  width: number; // device px
  height: number;
  diffPercent: number;
}

/** Render a standalone HTML page with a draggable slider comparing the two shots. */
export function renderSliderHtml(input: OverlayInput): string {
  const { designSrc, domSrc, heatmapSrc, width, height, diffPercent } = input;
  const pct = diffPercent.toFixed(2);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>design-diff overlay</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px system-ui, sans-serif; background: #111; color: #eee; }
  header { display: flex; gap: 16px; align-items: center; padding: 10px 14px; background: #1b1b1b; position: sticky; top: 0; }
  header b { font-weight: 600; }
  .diff { color: ${diffPercent > 1 ? "#ff8a80" : "#a5d6a7"}; }
  button { background: #2a2a2a; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
  button[aria-pressed="true"] { background: #3d5afe; border-color: #3d5afe; }
  .stage { display: grid; place-items: center; padding: 16px; }
  .frame { position: relative; width: ${width}px; max-width: 100%; aspect-ratio: ${width} / ${height}; overflow: hidden; box-shadow: 0 0 0 1px #333; }
  .frame img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; user-select: none; -webkit-user-drag: none; }
  .top { clip-path: inset(0 50% 0 0); }
  .divider { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: #3d5afe; pointer-events: none; }
  input[type=range] { width: ${width}px; max-width: 100%; margin: 8px auto 0; display: block; }
  .hint { text-align: center; color: #999; padding-bottom: 24px; }
</style>
</head>
<body>
<header>
  <b>design-diff</b>
  <span>left of the line: <b>Figma</b> &nbsp;|&nbsp; right: <b>live page</b></span>
  <span class="diff">pixel diff: ${pct}%</span>
  <button id="heat" aria-pressed="false">Show heatmap</button>
</header>
<div class="stage">
  <div class="frame">
    <img id="base" src="${domSrc}" alt="live page" data-dom="${domSrc}" data-heat="${heatmapSrc}">
    <img id="top" class="top" src="${designSrc}" alt="figma design">
    <div class="divider" id="divider"></div>
  </div>
</div>
<input type="range" id="slider" min="0" max="100" value="50" aria-label="overlay position">
<p class="hint">Drag the slider. Toggle the heatmap to see where pixels differ.</p>
<script>
  const top = document.getElementById('top');
  const divider = document.getElementById('divider');
  const slider = document.getElementById('slider');
  const base = document.getElementById('base');
  const heat = document.getElementById('heat');
  function setPos(v) {
    top.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
    divider.style.left = v + '%';
  }
  slider.addEventListener('input', (e) => setPos(+e.target.value));
  heat.addEventListener('click', () => {
    const on = heat.getAttribute('aria-pressed') === 'true';
    heat.setAttribute('aria-pressed', String(!on));
    heat.textContent = on ? 'Show heatmap' : 'Hide heatmap';
    base.src = on ? base.dataset.dom : base.dataset.heat;
  });
  setPos(50);
</script>
</body>
</html>
`;
}
