// Currency metadata. Names come from Intl.DisplayNames, so only codes live here.
export const CURRENCY_CODES = `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL
BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL
GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KRW KWD KYD KZT
LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR
PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SYP SZL THB
TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL`.split(/\s+/);

export const POPULAR = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'INR', 'AED', 'SAR', 'EGP', 'TRY', 'MXN', 'BRL', 'KRW'];

const FLAG_OVERRIDES = { EUR: 'EU', ANG: 'CW' };

let displayNames = null;
try { displayNames = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { /* old browser */ }

export function currencyName(code) {
  try { return displayNames?.of(code) || code; } catch { return code; }
}

export function currencyFlag(code) {
  if (code.startsWith('X') && !FLAG_OVERRIDES[code]) return '🌐';
  const region = FLAG_OVERRIDES[code] || code.slice(0, 2);
  return String.fromCodePoint(...[...region].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const decimalsCache = {};
export function currencyDecimals(code) {
  if (decimalsCache[code] == null) {
    try {
      decimalsCache[code] = new Intl.NumberFormat('en', { style: 'currency', currency: code })
        .resolvedOptions().maximumFractionDigits;
    } catch { decimalsCache[code] = 2; }
  }
  return decimalsCache[code];
}

// Region → currency, used only to pre-select a sensible home currency on first run.
const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ');
const REGION_CURRENCY = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', IN: 'INR', CH: 'CHF',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY', RU: 'RUB',
  UA: 'UAH', EG: 'EGP', SA: 'SAR', AE: 'AED', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD',
  MA: 'MAD', ZA: 'ZAR', NG: 'NGN', KE: 'KES', BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
  PE: 'PEN', KR: 'KRW', SG: 'SGD', HK: 'HKD', TW: 'TWD', TH: 'THB', MY: 'MYR', ID: 'IDR', PH: 'PHP',
  VN: 'VND', PK: 'PKR', BD: 'BDT', IL: 'ILS',
};
EURO.forEach((r) => { REGION_CURRENCY[r] = 'EUR'; });

export function guessHomeCurrency() {
  for (const lang of navigator.languages || [navigator.language]) {
    const region = lang?.split('-')[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  return 'USD';
}
