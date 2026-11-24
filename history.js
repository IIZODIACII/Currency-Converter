// Historical rates for the rate chart. Free, no key.
// Uses Frankfurter (ECB data, one request) when both currencies are covered,
// otherwise fawazahmed0/exchange-api (one small file per day).
const FRANKFURTER = new Set(('AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR '
  + 'NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR').split(' '));

const dayCache = new Map(); // 'YYYY-MM-DD' -> { CODE: rate vs USD }
const seriesCache = new Map(); // 'FROM-TO-days' -> points

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fromFrankfurter(from, to, days) {
  const j = await getJSON(`https://api.frankfurter.dev/v1/${iso(daysAgo(days))}..${iso(new Date())}?base=${from}&symbols=${to}`);
  return Object.entries(j.rates)
    .map(([date, r]) => ({ date, rate: r[to] }))
    .filter((p) => Number.isFinite(p.rate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function usdRatesOn(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ];
  for (const url of urls) {
    try {
      const j = await getJSON(url);
      const rates = {};
      for (const [k, v] of Object.entries(j.usd)) rates[k.toUpperCase()] = v;
      dayCache.set(date, rates);
      return rates;
    } catch { /* try next mirror */ }
  }
  return null; // a missing day (e.g. not published yet) is skipped
}

async function fromDailyFiles(from, to, days) {
  // Daily points for a week; every other day for a month keeps it to ~16 requests.
  const step = days > 10 ? 2 : 1;
  const dates = [];
  for (let n = days; n >= 1; n -= step) dates.push(iso(daysAgo(n)));
  const all = await Promise.all(dates.map(usdRatesOn));
  return dates
    .map((date, i) => ({ date, rate: all[i] && all[i][to] / all[i][from] }))
    .filter((p) => Number.isFinite(p.rate));
}

/**
 * Returns [{date, rate}] (rate = units of `to` per 1 `from`), oldest first.
 * `todayRate` (from the live rates) is appended so the line ends at the current rate.
 */
export async function fetchHistory(from, to, days, todayRate) {
  const key = `${from}-${to}-${days}`;
  let points = seriesCache.get(key);
  if (!points) {
    points = [];
    if (FRANKFURTER.has(from) && FRANKFURTER.has(to)) {
      try { points = await fromFrankfurter(from, to, days); } catch { /* fall back below */ }
    }
    if (points.length < 2) points = await fromDailyFiles(from, to, days);
    if (points.length) seriesCache.set(key, points);
  }
  const today = iso(new Date());
  const out = points.filter((p) => p.date !== today);
  if (Number.isFinite(todayRate)) out.push({ date: today, rate: todayRate });
  return out;
}
