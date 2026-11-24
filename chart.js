// Rate-history bottom sheet with a single-series line chart (inline SVG).
import { el, $ } from './ui.js';
import { fetchHistory } from './history.js';
import { currencyFlag } from './currencies.js';

const RANGES = [[7, '7D'], [30, '30D']];
let lastRange = 7;

const fmtDate = (iso, opts = { month: 'short', day: 'numeric' }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/**
 * Opens the sheet for `from` → `to`.
 * getRate(from, to) returns the current live rate; formatRate formats a rate value.
 */
export function openRateSheet(from, to, { getRate, formatRate }) {
  const dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  // Tap on the backdrop closes the sheet.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  let range = lastRange;
  let token = 0;

  const render = async () => {
    const my = ++token;
    const rate = getRate(from, to);
    const body = el('div', { class: 'chart-body' }, el('div', { class: 'chart-msg' }, 'Loading history…'));
    dialog.replaceChildren(el('div', { class: 'sheet-inner' },
      el('div', { class: 'sheet-head' },
        el('h2', { id: 'sheet-title' },
          el('span', { 'aria-hidden': 'true' }, currencyFlag(from)), ` ${from} → ${to} `,
          el('span', { 'aria-hidden': 'true' }, currencyFlag(to))),
        el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
      el('div', { class: 'hero' },
        el('div', { class: 'hero-num' }, `${formatRate(rate)} ${to}`),
        el('div', { class: 'muted' }, `for 1 ${from} today`),
        el('div', { class: 'hero-change', id: 'hero-change' })),
      el('div', { class: 'sheet-controls' },
        el('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' },
          RANGES.map(([d, label]) => el('button', {
            'aria-pressed': String(d === range),
            onclick: () => { range = lastRange = d; render(); },
          }, label))),
        el('button', {
          class: 'link-btn', 'aria-label': `Swap to ${to} to ${from}`,
          onclick: () => { [from, to] = [to, from]; render(); },
        }, '⇄ Swap')),
      body,
      el('p', { class: 'source muted' }, 'Historical data: ECB via Frankfurter, or fawazahmed0/exchange-api')));
    if (!dialog.open) dialog.showModal();

    let points;
    try {
      points = await fetchHistory(from, to, range, rate);
    } catch { points = []; }
    if (my !== token) return; // user switched range/direction meanwhile
    if (points.length < 2) {
      body.replaceChildren(el('div', { class: 'chart-msg' }, 'History isn’t available right now. Check your connection and try again.'));
      return;
    }
    const first = points[0].rate;
    const last = points[points.length - 1].rate;
    const pct = ((last - first) / first) * 100;
    const arrow = pct > 0.005 ? '▲' : pct < -0.005 ? '▼' : '▬';
    $('#hero-change', dialog).textContent = `${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% over ${range} days`;
    const rates = points.map((p) => p.rate);
    body.replaceChildren(
      drawChart(points, { formatRate, to, from }),
      el('div', { class: 'chart-stats' },
        el('div', {}, el('small', { class: 'muted' }, 'Low'), el('strong', {}, formatRate(Math.min(...rates)))),
        el('div', {}, el('small', { class: 'muted' }, 'High'), el('strong', {}, formatRate(Math.max(...rates)))),
        el('div', {}, el('small', { class: 'muted' }, 'Average'), el('strong', {}, formatRate(rates.reduce((a, b) => a + b, 0) / rates.length)))),
      el('details', { class: 'chart-table' },
        el('summary', {}, 'Show data table'),
        el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, `1 ${from} in ${to}`))),
          el('tbody', {}, [...points].reverse().map((p) => el('tr', {}, el('td', {}, fmtDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })), el('td', {}, formatRate(p.rate))))))),
    );
  };
  render();
}

function drawChart(points, { formatRate, to, from }) {
  const W = 360; const H = 190;
  const pad = { t: 12, r: 12, b: 24, l: 12 };
  const rates = points.map((p) => p.rate);
  let lo = Math.min(...rates); let hi = Math.max(...rates);
  const span = hi - lo || Math.abs(hi) * 0.01 || 1;
  lo -= span * 0.12; hi += span * 0.12;
  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join('');
  const areaPath = `${linePath}L${x(points.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`;
  const grid = [0.25, 0.5, 0.75].map((f) => {
    const v = lo + (hi - lo) * f;
    return el('g', {},
      el('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }),
      el('text', { class: 'axis-label', x: pad.l + 2, y: y(v) - 4 }, formatRate(v)));
  });
  const lastI = points.length - 1;

  const cross = el('line', { class: 'crosshair', y1: pad.t, y2: H - pad.b, visibility: 'hidden' });
  const dot = el('circle', { class: 'hover-dot', r: 4.5, visibility: 'hidden' });
  const tip = el('div', { class: 'chart-tip', hidden: true });

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
    'aria-label': `${from} to ${to} rate from ${fmtDate(points[0].date)} (${formatRate(points[0].rate)}) to ${fmtDate(points[lastI].date)} (${formatRate(points[lastI].rate)})`,
  },
  el('defs', {}, el('linearGradient', { id: 'area-fill', x1: 0, x2: 0, y1: 0, y2: 1 },
    el('stop', { offset: '0%', class: 'area-stop-top' }),
    el('stop', { offset: '100%', class: 'area-stop-bottom' }))),
  grid,
  el('line', { class: 'baseline', x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b }),
  el('path', { class: 'area', d: areaPath }),
  el('path', { class: 'line', d: linePath }),
  el('text', { class: 'axis-label', x: pad.l, y: H - 6 }, fmtDate(points[0].date)),
  el('text', { class: 'axis-label', x: W - pad.r, y: H - 6, 'text-anchor': 'end' }, fmtDate(points[lastI].date)),
  el('circle', { class: 'end-dot', cx: x(lastI), cy: y(points[lastI].rate), r: 4.5 }),
  cross, dot,
  // Full-size transparent hit area so the whole plot responds to hover/scrub.
  el('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));

  const wrap = el('div', { class: 'chart-wrap' }, svg, tip);
  const showAt = (clientX) => {
    const box = svg.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(lastI, Math.round(((sx - pad.l) / (W - pad.l - pad.r)) * lastI)));
    const p = points[i];
    for (const n of [cross]) { n.setAttribute('x1', x(i)); n.setAttribute('x2', x(i)); n.setAttribute('visibility', 'visible'); }
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.rate)); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(el('small', {}, fmtDate(p.date, { weekday: 'short', month: 'short', day: 'numeric' })), el('strong', {}, `${formatRate(p.rate)} ${to}`));
    const px = (x(i) / W) * box.width;
    tip.style.left = `${Math.max(56, Math.min(box.width - 56, px))}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', (e) => showAt(e.clientX));
  svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointercancel', hide);
  return wrap;
}
