// URL <-> Params、組裝請求（build）
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- URL <-> params ---------- */
function syncParamsFromUrl(t) {
  const q = t.url.split('#')[0].split('?')[1];
  const parsed = q ? q.split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); const d = (x) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } }; return { on: true, k: d(i < 0 ? p : p.slice(0, i)), v: i < 0 ? '' : d(p.slice(i + 1)) }; }) : [];
  t.params = [...parsed, ...t.params.filter((p) => p.on === false)];
}
function syncUrlFromParams(t) {
  const [base, hash] = t.url.split('#'); const root = base.split('?')[0];
  const q = t.params.filter((p) => p.on !== false && p.k).map((p) => encodeURIComponent(p.k) + '=' + encodeURIComponent(p.v)).join('&');
  t.url = root + (q ? '?' + q : '') + (hash !== undefined ? '#' + hash : '');
}

/* ---------- 組裝請求 ---------- */
function build(t) {
  const headers = {};
  t.headers.filter((h) => h.on !== false && h.k).forEach((h) => (headers[sub(h.k)] = sub(h.v)));
  const has = (n) => Object.keys(headers).some((k) => k.toLowerCase() === n);
  if (t.auth.type === 'bearer' && t.auth.token && !has('authorization')) headers.Authorization = 'Bearer ' + sub(t.auth.token);
  if (t.auth.type === 'basic' && !has('authorization')) headers.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(sub(t.auth.user) + ':' + sub(t.auth.pass))));
  if (t.auth.type === 'coll') {
    const cfg = (S.colls.find((c) => c.id === t.collId) || {}).cfg || {};
    const tok = vars().token;
    if (tok) {
      const hn = cfg.header || 'Authorization';
      if (!has(hn.toLowerCase())) headers[hn] = (cfg.prefix ?? 'Bearer ') + tok;
      if (cfg.cookie) { // 有些後台同時驗 Cookie（如 authKey）
        const ck = Object.keys(headers).find((k) => k.toLowerCase() === 'cookie'); const pair = cfg.cookie + '=' + tok;
        if (!ck) headers.Cookie = pair;
        else if (!(';' + headers[ck].replace(/\s/g, '')).includes(';' + cfg.cookie + '=')) headers[ck] += '; ' + pair;
      }
    }
  }
  let body;
  if (t.bodyType === 'json') { body = sub(t.body); if (!has('content-type')) headers['Content-Type'] = 'application/json'; }
  else if (t.bodyType === 'text') { body = sub(t.body); if (!has('content-type')) headers['Content-Type'] = 'text/plain'; }
  else if (t.bodyType === 'form') { body = t.form.filter((f) => f.on !== false && f.k).map((f) => encodeURIComponent(sub(f.k)) + '=' + encodeURIComponent(sub(f.v))).join('&'); if (!has('content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  return { url: sub(t.url.trim()), method: t.method, headers, body };
}

