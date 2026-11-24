// Small shared UI helpers: element builder, toast, clipboard.
export const $ = (sel, root = document) => root.querySelector(sel);

export const el = (tag, attrs = {}, ...children) => {
  const svg = ['svg', 'path', 'line', 'circle', 'rect', 'text', 'g', 'defs', 'linearGradient', 'stop'].includes(tag);
  const node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.setAttribute('class', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c != null));
  return node;
};

let toastTimer;
/** Shows a short message at the bottom, optionally with an action button (e.g. Undo). */
export function toast(message, action) {
  let box = $('#toast');
  if (!box) {
    box = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.replaceChildren(el('span', {}, message));
  if (action) {
    box.append(el('button', {
      class: 'toast-action',
      onclick: () => { hide(); action.run(); },
    }, action.label));
  }
  box.classList.add('show');
  clearTimeout(toastTimer);
  const hide = () => box.classList.remove('show');
  toastTimer = setTimeout(hide, action ? 5000 : 2200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard access.
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const icons = {
  copy: () => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    el('rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }),
    el('path', { d: 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1' })),
  grip: () => el('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true', fill: 'currentColor' },
    ...[6, 12, 18].flatMap((y) => [el('circle', { cx: 9, cy: y, r: 1.6 }), el('circle', { cx: 15, cy: y, r: 1.6 })])),
  chart: () => el('svg', { viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    el('path', { d: 'M3 17l6-6 4 4 8-8' })),
};
