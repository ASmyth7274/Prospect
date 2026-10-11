export function fmtNum(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e7) return (n / 1e6).toFixed(1) + 'M';
  return n.toLocaleString('en-US');
}

export function fmtMoney(n) {
  return '$' + fmtNum(n);
}

export function fmtKg(kg) {
  if (kg < 0.1) return (kg * 1000).toFixed(0) + 'g';
  if (kg < 10) return kg.toFixed(2) + 'kg';
  return kg.toFixed(1) + 'kg';
}

export function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function fmtPct(v) {
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(v * 100 < 10 ? 1 : 0) + '%';
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
