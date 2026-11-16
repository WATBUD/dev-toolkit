// 送出：proxy、公鑰加密、doSend、Extract、接著執行、自動重登、回應日誌
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 送出 ---------- */
const keyCache = {};
const RSA_RE = /\{\{\s*\$rsa\(\s*([\w.-]+)\s*\)\s*\}\}/g;
async function proxy(p) {
  const resp = await fetch('/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  return resp.json();
}
// 取得 RSA 公鑰：GET 環境變數 rsaKeyUrl，回應 data 為 PEM 字串（或 publicKey / rsaPublicKey / key / pem 欄位）。
async function getPublicKey() {
  const pk = String(vars().publicKey || '').trim(); // 取公鑰的請求用 Extract 存成 publicKey 時，直接用它
  if (pk) return pk;
  const url = sub('{{rsaKeyUrl}}');
  if (/\{\{/.test(url)) throw new Error('沒有公鑰：請先執行取公鑰的請求（Extract 存成 publicKey），或在環境變數設定 rsaKeyUrl');
  if (keyCache[url]) return keyCache[url];
  const j = await proxy({ url, method: 'GET', headers: { Accept: 'application/json' }, timeoutMs: 15000 });
  if (j.error) throw new Error('取得公鑰失敗：' + j.error);
  if (j.status >= 400) throw new Error('取得公鑰失敗：HTTP ' + j.status);
  let key = '';
  try { const b = JSON.parse(j.body); const d = b.data ?? b; key = typeof d === 'string' ? d : (d.publicKey || d.rsaPublicKey || d.key || d.pem || ''); } catch { key = j.body; }
  key = String(key).trim();
  if (!key) throw new Error('公鑰回應格式無法辨識');
  return (keyCache[url] = key);
}
// 把 {{$rsa(變數名)}} 換成「該變數值以公鑰加密後的 base64」。每次送出重新加密（PKCS#1 v1.5 每次密文都不同）。
async function resolveDynamic(r) {
  const names = new Set();
  const scan = (x) => { for (const m of String(x ?? '').matchAll(RSA_RE)) names.add(m[1]); };
  scan(r.url); scan(r.body); Object.values(r.headers).forEach(scan);
  if (!names.size) return;
  const key = await getPublicKey(); const out = {};
  for (const n of names) {
    const plain = vars()[n];
    if (plain === undefined || plain === '') throw new Error(`環境變數 ${n} 沒有值（{{$rsa(${n})}} 的加密來源）`);
    const j = await (await fetch('/crypto/rsa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: key, plain }) })).json();
    if (j.error) { delete keyCache[sub('{{rsaKeyUrl}}')]; throw new Error(j.error); }
    out[n] = j.cipher;
  }
  const re = (x) => (typeof x === 'string' ? x.replace(RSA_RE, (m, n) => out[n]) : x);
  r.url = re(r.url); r.body = re(r.body); for (const k in r.headers) r.headers[k] = re(r.headers[k]);
}
async function doSend(t) { const prev = ctxT; ctxT = t; try { return await doSendInner(t); } finally { ctxT = prev; } }
async function doSendInner(t) {
  const r = build(t);
  if (!r.url) return { error: '請輸入 URL' };
  if (!/^https?:\/\//i.test(r.url)) r.url = 'http://' + r.url;
  let autoKey = '';
  const needsKey = [r.url, r.body, ...Object.values(r.headers)].some((x) => new RegExp(RSA_RE.source).test(String(x ?? '')));
  if (needsKey && !String(vars().publicKey || '').trim() && /\{\{/.test(sub('{{rsaKeyUrl}}'))) {
    const co = S.colls.find((c) => c.id === t.collId);
    const pv = co && co.items.map(liveReq).find((i) => i.id !== t.id && (i.extract || []).some((x) => x.on !== false && String(x.v).trim() === 'publicKey'));
    if (pv) {
      autoKey = pv.name || pv.url;
      const tmp = JSON.parse(JSON.stringify(pv)); const pres = await doSend(tmp); applyExtract(tmp, pres); logRes(tmp, pres, 'key');
      if (pres.error || pres.status >= 400 || !String(vars().publicKey || '').trim())
        return { error: `自動執行「${autoKey}」取得公鑰失敗` + (pres.error ? '：' + pres.error : pres.status >= 400 ? `（HTTP ${pres.status}）` : '（回應裡找不到要擷取成 publicKey 的欄位）') };
    }
  }
  try { await resolveDynamic(r); } catch (e) { return { error: e.message, req: { method: r.method, url: r.url, headers: r.headers, body: r.body } }; }
  try {
    const res = await proxy({ ...r, timeoutMs: 30000 });
    // 實際送出的請求：{{變數}} 已代入、{{$rsa()}} 已加密；Header 以 server 實際發出的為準（含自動補上的 User-Agent）
    res.req = { method: r.method, url: (res.sent && res.sent.url) || r.url, headers: (res.sent && res.sent.headers) || r.headers, body: r.body }; delete res.sent;
    if (autoKey) res.autoKey = autoKey; return res;
  } catch (e) { return { error: String(e), req: { method: r.method, url: r.url, headers: r.headers, body: r.body } }; }
}
// 回應日誌：每次實際發出的請求（含自動取公鑰、接著執行、自動重登）都記一筆。
// 只放在記憶體，重新整理就清空：回應裡可能有 token，不寫到磁碟。
const RLOG = []; let runSeq = 0, curRun = 0;
function logRes(t, res, kind) {
  RLOG.unshift({ id: uid(), run: curRun, at: Date.now(), kind, name: t.name || '', method: t.method, url: t.url, res });
  if (RLOG.length > 200) RLOG.length = 200;
}
function getPath(o, path) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  // 欄位名先精確比對，找不到再不分大小寫（accessToken 也能找到 AccessToken）
  const pick = (x, k) => { if (k in x) return x[k]; const kk = Object.keys(x).find((n) => n.toLowerCase() === k.toLowerCase()); return kk === undefined ? undefined : x[kk]; };
  let v = o;
  for (const p of parts) { if (v == null || typeof v !== 'object') { v = undefined; break; } v = pick(v, p); }
  if (v === undefined && parts.length === 1) { // 單一欄位名：往下找
    const find = (x, d = 0) => { if (!x || typeof x !== 'object' || d > 5) return; const hit = pick(x, parts[0]); if (hit !== undefined) return hit; for (const c of Object.values(x)) { const r = find(c, d + 1); if (r !== undefined) return r; } };
    v = find(o);
  }
  return v;
}
function setVar(k, v, src, t) {
  const co = collOf(t || ctxT || cur());
  let env = S.envs.find((e) => e.id === (co ? co.env : S.env));
  if (!env) { env = { id: uid(), name: co ? co.name : '預設', vars: [] }; S.envs.push(env); if (co) co.env = env.id; else S.env = env.id; }
  const ex = env.vars.find((x) => x.k === k);
  const meta = src ? { src, at: Date.now() } : {}; // src / at：由哪個請求的 Extract、何時存進來（顯示在左側「變數」分頁）
  if (ex) Object.assign(ex, { v }, meta); else env.vars.push({ on: true, k, v, secret: /token|pass|secret/i.test(k), ...meta });
}
function applyExtract(t, res) {
  const rules = (t.extract || []).filter((x) => x.on !== false && x.k && x.v);
  if (!rules.length || res.error || !res.isText || res.status >= 400) return;
  let j; try { j = JSON.parse(res.body); } catch { return; }
  res.extracted = []; res.missing = [];
  for (const x of rules) {
    const v = getPath(j, x.k.trim());
    if (v === undefined || v === null) res.missing.push(x.k);
    else { setVar(x.v.trim(), typeof v === 'string' ? v : JSON.stringify(v), t.name || t.url, t); res.extracted.push(x.v.trim()); }
  }
}
async function runLogin(collId) {
  const co = S.colls.find((c) => c.id === collId);
  const li0 = co && co.cfg && co.cfg.loginId && co.items.find((i) => i.id === co.cfg.loginId); const li = li0 && liveReq(li0);
  if (!li) return { ok: false };
  const tmp = JSON.parse(JSON.stringify(li));
  const res = await doSend(tmp); applyExtract(tmp, res); logRes(tmp, res, 'relogin');
  return { ok: !res.error && res.status >= 200 && res.status < 300 && !(res.missing || []).length, res };
}
// 送出 → 擷取變數 → 若 401 且用「集合共用」auth，自動重登一次再重送
async function execute(t, depth = 0) {
  let res = await doSend(t); applyExtract(t, res); logRes(t, res, depth ? 'next' : 'main');
  if (!res.error && res.status === 401 && t.auth.type === 'coll' && t.collId) {
    const lg = await runLogin(t.collId);
    if (lg.ok) { res = await doSend(t); applyExtract(t, res); res.relogin = true; logRes(t, res, 'retry'); } else res.reloginFailed = true;
  }
  // 成功（且 Extract 都有取到）後，接著執行同集合裡指定的請求；最多串 5 層避免循環
  if (t.next && depth < 5 && !res.error && res.status < 400 && !(res.missing || []).length) {
    const co = S.colls.find((c) => c.id === t.collId);
    const nx = co && co.items.map(liveReq).find((i) => (i.name || '') === t.next && i.id !== t.id);
    if (!nx) res.chain = [{ name: t.next, error: '找不到這個請求（要在同一個集合裡）' }];
    else {
      const nr = await execute({ ...JSON.parse(JSON.stringify(nx)), collId: co.id }, depth + 1);
      res.chain = [{ name: t.next, status: nr.status, error: nr.error, extracted: nr.extracted, missing: nr.missing, autoKey: nr.autoKey, unsaved: !!nx.__unsaved, res: nr }, ...(nr.chain || [])];
    }
  }
  return res;
}
const badges = (r) =>
  (r.relogin ? '<span class="hint">🔄 已自動重新登入</span>' : '') +
  (r.reloginFailed ? '<span style="color:var(--bad)">自動重登失敗</span>' : '') +
  (r.extracted && r.extracted.length ? `<span class="hint">✔ 已擷取 ${r.extracted.map(esc).join('、')}</span>` : '') +
  (r.missing && r.missing.length ? `<span style="color:var(--bad)">找不到欄位 ${r.missing.map(esc).join('、')}</span>` : '') +
  (r.autoKey ? `<span class="hint">🔑 已先執行「${esc(r.autoKey)}」取得公鑰</span>` : '') +
  (r.chain || []).map((c) => c.error
    ? `<span style="color:var(--bad)">→ ${esc(c.name)}：${esc(c.error)}</span>`
    : `<span class="hint">→ ${esc(c.name)}${c.unsaved ? ' <span title="這一步用的是分頁裡尚未儲存的版本">（分頁未儲存版本）</span>' : ''} <b style="color:${c.status < 400 ? 'var(--ok)' : 'var(--bad)'}">${c.status}</b>${c.extracted && c.extracted.length ? ' ✔ 已擷取 ' + c.extracted.map(esc).join('、') : ''}${c.missing && c.missing.length ? ' ⚠ 找不到 ' + c.missing.map(esc).join('、') : ''}</span>`).join('');

async function sendReq() {
  const t = cur(); if (!t) return;
  curRun = ++runSeq; S.resStep = 0; S.logView = null;
  t.res = { loading: true }; renderRes();
  const res = await execute(t); t.res = res;
  if (!res.error) {
    S.hist.unshift({ id: uid(), at: Date.now(), status: res.status, req: strip(t) }); S.hist = S.hist.slice(0, 60);
    if (res.isText && /json/i.test(res.contentType || '')) captureToken(res);
  }
  persist(); renderRes(); renderSide();
}
const strip = ({ res, dirty, ...x }) => JSON.parse(JSON.stringify(x));
// 回應 JSON 裡若有 token 類欄位，提示一鍵存成環境變數
let lastToken = null;
function captureToken(res) { try { const j = JSON.parse(res.body); const f = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 3) return; for (const [k, v] of Object.entries(o)) { if (/token/i.test(k) && typeof v === 'string' && v.length > 20) return [k, v]; const r = f(v, d + 1); if (r) return r; } }; lastToken = f(j) || null; } catch { lastToken = null; } }

