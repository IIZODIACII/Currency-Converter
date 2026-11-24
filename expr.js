// Tiny safe calculator: numbers, + - * / ( ), plus × ÷ and thousands separators.
export function normalizeNumberText(text) {
  let s = text.replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  // "1,234.5" → grouping commas; "12,5" → decimal comma (when there's no dot in that number).
  s = s.replace(/\d[\d,.]*/g, (num) => {
    if (num.includes('.')) return num.replace(/,/g, '');
    if (/^\d{1,3}(,\d{3})+$/.test(num)) return num.replace(/,/g, '');
    return num.replace(',', '.').replace(/,/g, '');
  });
  return s;
}

/** Returns a finite number, or null when the text is empty/invalid. */
export function evaluate(text) {
  const s = normalizeNumberText(text);
  if (!s) return null;
  let i = 0;
  const peek = () => s[i];
  function number() {
    const m = /^\d*\.?\d*/.exec(s.slice(i))[0];
    if (!m || m === '.') throw new Error('number expected');
    i += m.length;
    return parseFloat(m);
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() === ')') i++;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      v = op === '*' ? v * factor() : v / factor();
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      if (i >= s.length) break; // allow a trailing operator while typing ("100+")
      v = op === '+' ? v + term() : v - term();
    }
    return v;
  }
  try {
    let v = expr();
    // Trailing "*" or "/" while typing: ignore it.
    if (i < s.length && /^[*/]$/.test(s.slice(i))) i = s.length;
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch { return null; }
}

export function isExpression(text) {
  return /\d\s*[-+*/×÷xX]\s*[\d(]/.test(text.trim());
}

/** Adds thousands separators to every number in the text: "20000+1500.25" → "20,000+1,500.25". */
export function groupDigits(text) {
  return text.replace(/(\d[\d,]*)(\.\d*)?/g, (_, int, dec = '') =>
    int.replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + dec);
}
