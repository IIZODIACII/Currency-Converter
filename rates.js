// Fetches exchange rates (all relative to USD) and caches them for offline use.
const CACHE_KEY = 'cc.rates';
const MAX_AGE_MS = 60 * 60 * 1000; // refetch when the cached copy is older than 1 hour

const SOURCES = [
  {
    name: 'ExchangeRate-API',
    link: 'https://www.exchangerate-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (j) => {
      if (j.result !== 'success') throw new Error('bad response');
      return { rates: j.rates, updated: j.time_last_update_unix * 1000 };
    },
  },
  {
    name: 'fawazahmed0/currency-api',
    link: 'https://github.com/fawazahmed0/exchange-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    parse: (j) => {
      const rates = {};
      for (const [k, v] of Object.entries(j.usd)) rates[k.toUpperCase()] = v;
      return { rates, updated: Date.parse(j.date + 'T00:00:00Z') };
    },
  },
];

export function loadCachedRates() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY));
    return data?.rates ? data : null;
  } catch { return null; }
}

export function isStale(data) {
  return !data || Date.now() - data.fetched > MAX_AGE_MS;
}

export async function fetchRates() {
  let lastError;
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = src.parse(await res.json());
      const data = { ...parsed, fetched: Date.now(), source: src.name, sourceLink: src.link };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full/blocked */ }
      return data;
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error('No rate source available');
}

/** Converts `amount` of `from` into `to` using USD-based rates. */
export function convert(amount, from, to, rates) {
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}
