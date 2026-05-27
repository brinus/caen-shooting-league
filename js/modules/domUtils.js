// DOM utilities and safe escaping helpers
export function esc(s){
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(ch){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
  });
}

export function fmtQ(q){
  const n = Number(q) || 0;
  if (!isFinite(n)) return '—';
  return (Math.round(n*100)/100).toFixed(2);
}

// safer JSON parse for data attributes
export function safeParseData(str){
  try { return JSON.parse(str); } catch(e){
    try { return Function('return ' + str)(); } catch(e2){ return null; }
  }
}
