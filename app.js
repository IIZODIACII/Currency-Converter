import {
  CURRENCY_CODES, POPULAR, currencyName, currencyFlag, currencyDecimals, guessHomeCurrency,
} from './currencies.js';
import { loadCachedRates, fetchRates, isStale, convert } from './rates.js';
import { evaluate, isExpression } from './expr.js';
import { $, el, toast, copyText, icons } from './ui.js';
import { openRateSheet } from './chart.js';
import { attachSwipe, attachDrag } from './gestures.js';

const SETTINGS_KEY = 'cc.settings';
const SESSION_KEY = 'cc.session';

// ---------- persisted state ----------
function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

let settings = readJSON(SETTINGS_KEY); // { home: 'USD', others: ['EUR', ...] }
let session = readJSON(SESSION_KEY) || {}; // { active: 'USD', text: '100' }
let ratesData = loadCachedRates();
let ratesError = null;
let loadingRates = false;

const saveSettings = () => writeJSON(SETTINGS_KEY, settings);
const saveSession = () => writeJSON(SESSION_KEY, session);

const allCodes = () => CURRENCY_CODES;
const selectedCodes = () => [settings.home, ...settings.others];

// ---------- formatting ----------
function formatAmount(value, code) {
  if (value == null || !Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const opts = abs > 0 && abs < 1
    ? { maximumSignificantDigits: 4 }
    : { minimumFractionDigits: currencyDecimals(code), maximumFractionDigits: currencyDecimals(code) };
  return new Intl.NumberFormat('en-US', opts).format(value);
}
function formatRate(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  if (value >= 0.01) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(value);
}
function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

// ---------- rates ----------
async function refreshRates(force = false) {
  if (loadingRates || (!force && !isStale(ratesData))) return;
  loadingRates = true;
  renderStatus();
  try {
    ratesData = await fetchRates();
    ratesError = null;
  } catch (e) {
    ratesError = e;
  } finally {
    loadingRates = false;
  }
  if (currentView === 'main') renderMain(); else renderStatus();
}

// ---------- views ----------
const app = $('#app');
let currentView = null;

function show(view, ...args) {
  currentView = view;
  app.replaceChildren();
  window.scrollTo(0, 0);
  ({ main: renderMain, onboarding: renderOnboarding, settings: renderSettings })[view](...args);
}

function header(title, { back, action } = {}) {
  return el('header', { class: 'topbar' },
    back ? el('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: back }, '←') : el('span', { class: 'brand-dot' }),
    el('h1', {}, title),
    action || el('span'));
}

// ----- currency picker (used by onboarding and settings) -----
function currencyPicker({ multi, selected, exclude = [], onChange }) {
  const chosen = new Set(selected);
  const search = el('input', {
    class: 'search', type: 'search', placeholder: 'Search currency or country…',
    'aria-label': 'Search currencies', autocomplete: 'off',
  });
  const list = el('ul', { class: 'picker', role: multi ? 'group' : 'radiogroup' });

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const codes = allCodes().filter((c) => !exclude.includes(c));
    const matches = (c) => !q || c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q);
    const popular = POPULAR.filter((c) => codes.includes(c) && matches(c));
    const rest = codes.filter((c) => !POPULAR.includes(c) && matches(c));
    // Keep already-chosen currencies easy to find at the top when not searching.
    const chosenFirst = q ? [] : [...chosen].filter((c) => codes.includes(c));
    const sections = q
      ? [['Results', [...popular, ...rest]]]
      : [['Selected', chosenFirst], ['Popular', popular.filter((c) => !chosen.has(c))], ['All currencies', rest.filter((c) => !chosen.has(c))]];
    list.replaceChildren();
    for (const [label, items] of sections) {
      if (!items.length) continue;
      list.append(el('li', { class: 'picker-label' }, label));
      for (const code of items) {
        const isOn = chosen.has(code);
        list.append(el('li', {},
          el('button', {
            class: `picker-item${isOn ? ' on' : ''}`, role: multi ? 'checkbox' : 'radio',
            'aria-checked': String(isOn), 'data-code': code,
            onclick: () => {
              if (multi) { isOn ? chosen.delete(code) : chosen.add(code); } else { chosen.clear(); chosen.add(code); }
              onChange([...chosen]);
              draw();
            },
          },
          el('span', { class: 'flag', 'aria-hidden': 'true' }, currencyFlag(code)),
          el('span', { class: 'picker-text' }, el('strong', {}, code), el('small', {}, currencyName(code))),
          el('span', { class: 'check', 'aria-hidden': 'true' }, isOn ? '✓' : ''))));
      }
    }
    if (!list.children.length) list.append(el('li', { class: 'empty' }, 'No currencies match your search.'));
  };
  search.addEventListener('input', draw);
  draw();
  return el('div', { class: 'picker-wrap' }, search, list);
}

// ----- onboarding: step 1 home, step 2 others -----
function renderOnboarding(step = 1, draft = { home: guessHomeCurrency(), others: [] }) {
  const footerBtn = el('button', { class: 'primary' });
  const footer = el('footer', { class: 'sticky-footer' });

  if (step === 1) {
    app.append(
      header('Welcome'),
      el('section', { class: 'intro' },
        el('p', { class: 'step' }, 'Step 1 of 2'),
        el('h2', {}, 'What’s your home currency?'),
        el('p', { class: 'muted' }, 'This is the currency you usually think in. You can change it later.')),
      currencyPicker({ multi: false, selected: [draft.home], onChange: ([c]) => { draft.home = c; } }),
    );
    footerBtn.textContent = 'Next';
    footerBtn.onclick = () => {
      draft.others = draft.others.filter((c) => c !== draft.home);
      show('onboarding', 2, draft);
    };
    footer.append(footerBtn);
  } else {
    const count = el('span', { class: 'muted' });
    const update = () => {
      footerBtn.disabled = draft.others.length === 0;
      count.textContent = draft.others.length ? `${draft.others.length} selected` : 'Pick at least one';
    };
    app.append(
      header('Welcome', { back: () => show('onboarding', 1, draft) }),
      el('section', { class: 'intro' },
        el('p', { class: 'step' }, 'Step 2 of 2'),
        el('h2', {}, 'Which currencies do you want to convert to?'),
        el('p', { class: 'muted' }, `Pick as many as you like. They’ll all update together as you type in ${draft.home} or any of them.`)),
      currencyPicker({ multi: true, selected: draft.others, exclude: [draft.home], onChange: (c) => { draft.others = c; update(); } }),
    );
    footerBtn.textContent = 'Start converting';
    footerBtn.onclick = () => {
      settings = { home: draft.home, others: draft.others };
      session = { active: draft.home, text: '100' };
      saveSettings(); saveSession();
      show('main');
    };
    footer.append(count, footerBtn);
    update();
  }
  app.append(footer);
}

// ----- main converter -----
function renderStatus() {
  const status = $('#rate-status');
  if (!status) return;
  let text;
  let cls = '';
  if (loadingRates && !ratesData) text = 'Loading exchange rates…';
  else if (!ratesData) { text = 'Couldn’t load rates. Check your connection.'; cls = 'error'; }
  else {
    text = `Rates updated ${timeAgo(ratesData.updated)}`;
    if (loadingRates) text += ' · refreshing…';
    else if (ratesError) { text += ' · offline'; cls = 'warn'; }
  }
  status.className = `status ${cls}`;
  status.textContent = text;
  const src = $('#rate-source');
  if (src && ratesData) {
    src.replaceChildren('Rates by ', el('a', { href: ratesData.sourceLink, target: '_blank', rel: 'noopener' }, ratesData.source));
  }
}

let justFocused = false;

function renderMain() {
  if (currentView !== 'main') return;
  if (!selectedCodes().includes(session.active)) {
    // The currency being typed in was removed: carry the amount over to the home currency.
    const amount = evaluate(session.text || '');
    const rates = ratesData?.rates;
    session.text = amount != null && rates?.[session.active] && rates[settings.home]
      ? formatAmount(convert(amount, session.active, settings.home, rates), settings.home)
      : '100';
    session.active = settings.home;
    saveSession();
  }
  if (session.text == null) session.text = '100';

  app.replaceChildren(
    header('Converter', {
      action: el('button', { class: 'icon-btn', 'aria-label': 'Edit currencies', title: 'Edit currencies', onclick: () => show('settings') }, '⚙'),
    }),
    el('div', { class: 'status-bar' },
      el('span', { id: 'rate-status', class: 'status', role: 'status' }),
      el('button', { class: 'link-btn', onclick: () => refreshRates(true) }, 'Refresh')),
    el('ul', { class: 'rows', id: 'rows' },
      selectedCodes().map((code) => {
        const input = el('input', {
          class: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
          'aria-label': `Amount in ${code}`, 'data-code': code, enterkeyhint: 'done',
        });
        input.addEventListener('focus', () => {
          if (session.active !== code) {
            // Start a new conversion from this currency, keeping the displayed value.
            session.active = code;
            session.text = input.value;
            saveSession();
            updateRows();
          }
          input.select();
          justFocused = true;
        });
        // Keep the select-all from focus: the mouseup that follows a click would otherwise clear it.
        input.addEventListener('mouseup', (e) => { if (justFocused) e.preventDefault(); justFocused = false; });
        input.addEventListener('input', () => {
          session.active = code;
          session.text = input.value;
          saveSession();
          updateRows();
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        input.addEventListener('blur', () => {
          // Collapse "100+20" into "120" once the user is done.
          if (session.active === code && isExpression(input.value)) {
            const v = evaluate(input.value);
            if (v != null) { session.text = formatAmount(v, code); saveSession(); updateRows(); }
          }
        });
        const isHome = code === settings.home;
        const card = el('div', { class: 'row', onclick: (e) => { if (e.target === e.currentTarget) input.focus(); } },
          isHome
            ? el('span', { class: 'grip-space' })
            : el('button', { class: 'grip', 'aria-label': `Drag to reorder ${code}`, title: 'Drag to reorder' }, icons.grip()),
          el('button', { class: 'cur', 'aria-label': `${code} ${currencyName(code)}: show rate chart`, onclick: () => openChart(code) },
            el('span', { class: 'flag', 'aria-hidden': 'true' }, currencyFlag(code)),
            el('span', { class: 'cur-text' },
              el('span', { class: 'code' }, code, isHome ? el('span', { class: 'badge' }, 'Home') : null, el('span', { class: 'chart-hint' }, icons.chart())),
              el('span', { class: 'name' }, currencyName(code)))),
          el('div', { class: 'value' }, input),
          el('div', { class: 'meta' },
            el('div', { class: 'rate' }),
            el('button', { class: 'copy', 'aria-label': `Copy ${code} amount`, title: 'Copy amount', onclick: () => copyAmount(code, input.value) }, icons.copy())));
        const li = el('li', { class: isHome ? 'row-wrap home' : 'row-wrap', 'data-code': code },
          isHome ? null : el('div', { class: 'swipe-bg', 'aria-hidden': 'true' }, 'Remove'),
          card);
        if (!isHome) {
          attachSwipe(li, card, { onRemove: () => removeCurrency(code) });
          attachDrag(li, $('.grip', card), { onDrop: saveOrderFromDom });
        }
        return li;
      })),
    el('p', { class: 'hint muted' }, 'Type in any currency (math like 120*3 works). Tap a currency for its rate chart, drag ⠿ to reorder, swipe left to remove.'),
    el('p', { class: 'source muted', id: 'rate-source' }),
  );
  renderStatus();
  updateRows();
}

// ----- main-screen actions -----
function openChart(code) {
  const active = session.active;
  let from = active;
  let to = code;
  if (code === active) { from = code; to = code === settings.home ? settings.others[0] : settings.home; }
  if (!ratesData) { toast('Rates aren’t loaded yet.'); return; }
  openRateSheet(from, to, {
    getRate: (a, b) => convert(1, a, b, ratesData.rates),
    formatRate,
  });
}

async function copyAmount(code, shown) {
  const amount = evaluate(shown || '');
  if (amount == null) { toast('Nothing to copy yet'); return; }
  const plain = formatAmount(amount, code).replace(/,/g, '');
  toast(await copyText(plain) ? `Copied ${plain} ${code}` : 'Couldn’t copy');
}

function removeCurrency(code) {
  if (settings.others.length <= 1) {
    toast('Keep at least one currency to convert to');
    renderMain();
    return;
  }
  const index = settings.others.indexOf(code);
  const prevSession = { ...session };
  settings.others.splice(index, 1);
  saveSettings();
  renderMain();
  toast(`Removed ${code}`, {
    label: 'Undo',
    run: () => {
      if (!settings.others.includes(code)) settings.others.splice(index, 0, code);
      session = prevSession;
      saveSettings(); saveSession();
      if (currentView === 'main') renderMain();
    },
  });
}

function saveOrderFromDom() {
  const order = [...document.querySelectorAll('#rows .row-wrap')].map((li) => li.dataset.code).filter((c) => c !== settings.home);
  settings.others = order;
  saveSettings();
}

function updateRows() {
  const rates = ratesData?.rates;
  const active = session.active;
  const amount = evaluate(session.text || '');
  for (const row of document.querySelectorAll('#rows .row-wrap')) {
    const code = row.dataset.code;
    const input = $('.amount', row);
    const rateEl = $('.rate', row);
    const isActive = code === active;
    $('.row', row).classList.toggle('active', isActive);

    if (isActive) {
      if (input.value !== session.text) input.value = session.text;
      const expr = isExpression(session.text) && amount != null ? `= ${formatAmount(amount, code)} · ` : '';
      rateEl.textContent = `${expr}Converting from ${code}`;
      input.classList.toggle('invalid', session.text.trim() !== '' && amount == null);
      continue;
    }
    if (!rates || !rates[code] || !rates[active]) {
      input.value = '';
      input.placeholder = rates ? 'n/a' : '…';
      rateEl.textContent = rates ? 'Rate unavailable' : '';
      continue;
    }
    input.classList.remove('invalid');
    input.placeholder = '0';
    input.value = amount == null ? '' : formatAmount(convert(amount, active, code, rates), code);
    const fwd = convert(1, active, code, rates);
    rateEl.replaceChildren(
      el('span', {}, `1 ${active} = ${formatRate(fwd)} ${code}`),
      el('span', { class: 'inverse' }, `1 ${code} = ${formatRate(1 / fwd)} ${active}`));
  }
}

// ----- settings -----
function renderSettings(panel = null) {
  if (panel === 'home') {
    let pick = settings.home;
    app.append(
      header('Home currency', { back: () => show('settings') }),
      currencyPicker({ multi: false, selected: [settings.home], onChange: ([c]) => { pick = c; } }),
      el('footer', { class: 'sticky-footer' }, el('button', {
        class: 'primary',
        onclick: () => {
          const oldHome = settings.home;
          settings.others = settings.others.filter((c) => c !== pick);
          // Keep the previous home currency in the list instead of silently dropping it.
          if (oldHome !== pick && !settings.others.includes(oldHome)) settings.others.unshift(oldHome);
          settings.home = pick;
          saveSettings();
          show('settings');
        },
      }, 'Save')));
    return;
  }
  if (panel === 'add') {
    let picks = [...settings.others];
    app.append(
      header('Your currencies', { back: () => show('settings') }),
      currencyPicker({ multi: true, selected: picks, exclude: [settings.home], onChange: (c) => { picks = c; } }),
      el('footer', { class: 'sticky-footer' }, el('button', {
        class: 'primary',
        onclick: () => {
          // Preserve the user's existing order, append new ones at the end.
          settings.others = [...settings.others.filter((c) => picks.includes(c)), ...picks.filter((c) => !settings.others.includes(c))];
          saveSettings();
          show('settings');
        },
      }, 'Save')));
    return;
  }

  const move = (i, d) => {
    const o = settings.others;
    [o[i], o[i + d]] = [o[i + d], o[i]];
    saveSettings();
    show('settings');
  };
  app.append(
    header('Edit currencies', { back: () => show('main') }),
    el('section', { class: 'card' },
      el('h3', {}, 'Home currency'),
      el('button', { class: 'setting-row', onclick: () => show('settings', 'home') },
        el('span', { class: 'flag' }, currencyFlag(settings.home)),
        el('span', { class: 'picker-text' }, el('strong', {}, settings.home), el('small', {}, currencyName(settings.home))),
        el('span', { class: 'muted' }, 'Change ›'))),
    el('section', { class: 'card' },
      el('h3', {}, 'Convert to'),
      el('ul', { class: 'manage' },
        settings.others.map((code, i) => el('li', { 'data-code': code },
          el('span', { class: 'flag' }, currencyFlag(code)),
          el('span', { class: 'picker-text' }, el('strong', {}, code), el('small', {}, currencyName(code))),
          el('span', { class: 'actions' },
            el('button', { class: 'icon-btn sm', 'aria-label': `Move ${code} up`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
            el('button', { class: 'icon-btn sm', 'aria-label': `Move ${code} down`, disabled: i === settings.others.length - 1, onclick: () => move(i, 1) }, '↓'),
            el('button', {
              class: 'icon-btn sm', 'aria-label': `Make ${code} home currency`, title: 'Make home',
              onclick: () => { settings.others[i] = settings.home; settings.home = code; saveSettings(); show('settings'); },
            }, '⌂'),
            el('button', {
              class: 'icon-btn sm danger', 'aria-label': `Remove ${code}`, disabled: settings.others.length === 1,
              onclick: () => { settings.others.splice(i, 1); saveSettings(); show('settings'); },
            }, '✕'))))),
      el('button', { class: 'secondary', onclick: () => show('settings', 'add') }, '+ Add or remove currencies')),
    el('footer', { class: 'sticky-footer' }, el('button', { class: 'primary', onclick: () => show('main') }, 'Done')),
  );
}

// ---------- boot ----------
show(settings?.home && settings.others?.length ? 'main' : 'onboarding');
refreshRates();
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRates(); });
window.addEventListener('online', () => refreshRates(true));
setInterval(renderStatus, 60_000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
