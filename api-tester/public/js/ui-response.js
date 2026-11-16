// 回應區、請求檢視（含機密遮罩）
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 渲染：回應 ---------- */
const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
function hlJson(src) {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const [all, str, colon, bool, nul] = m;
    out += str ? (colon ? `<span class="k">${esc(str)}</span>${esc(colon)}` : `<span class="s">${esc(str)}</span>`) : bool ? `<span class="b">${all}</span>` : `<span class="nu">${all}</span>`;
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}
// ---- 請求檢視：實際送出的方法、網址、Header、Body。機密預設遮罩，可勾「顯示機密」----
const SECRET_HEADER = /^(authorization|proxy-authorization|access-token|x-access-token|x-auth-token|x-api-key|api-key|cookie)$/i;
const secretValues = () => S.envs.flatMap((e) => e.vars).filter((v) => isSecret(v) && String(v.v || '').length >= 6).map((v) => String(v.v)).sort((a, b) => b.length - a.length);
const maskText = (str) => { let out = String(str ?? ''); if (S.showSec) return out; for (const v of secretValues()) out = out.split(v).join('••••••'); return out; };
const maskHeader = (k, v) => (S.showSec ? v : SECRET_HEADER.test(k) ? (v ? `••••••（${v.length} 字元）` : '') : maskText(v));
const reqHeaders = (q) => (Array.isArray(q.headers) ? q.headers : Object.entries(q.headers || {}));
const reqToCurl = (q) => [`curl -X ${q.method} ${qsh(q.url)}`, ...reqHeaders(q).map(([k, v]) => `-H ${qsh(k + ': ' + v)}`), ...(q.body ? [`--data-raw ${qsh(q.body)}`] : [])].join(' \\\n  ');
function renderReqView(q) {
  if (!q) return '<span class="hint">這筆沒有請求資料。</span>';
  const hs = reqHeaders(q);
  let bodyHtml = '<span class="hint">（沒有 Body）</span>';
  if (q.body) { const raw = maskText(q.body); let html = null; try { html = hlJson(JSON.stringify(JSON.parse(raw), null, 2)); } catch {} bodyHtml = `<pre>${html ?? esc(raw)}</pre>`; }
  return `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><b class="mt ${esc(q.method)}" style="min-width:auto">${esc(q.method)}</b><code style="word-break:break-all;flex:1">${esc(maskText(q.url))}</code>`
    + `<label class="hint" style="white-space:nowrap"><input type="checkbox" id="showsec" ${S.showSec ? 'checked' : ''} style="width:auto"> 顯示機密</label></div>`
    + `<div class="vsec">Headers（${hs.length}）</div>${hs.length ? `<table>${hs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(maskHeader(k, String(v)))}</td></tr>`).join('')}</table>` : '<span class="hint">（無）</span>'}`
    + `<div class="vsec">Body</div>${bodyHtml}`
    + `<p class="hint">這是實際送出的內容：{{變數}} 已代入、{{$rsa()}} 已加密。</p>`;
}
let shownRes = null; // 回應區目前顯示的那一份（本請求 / 串接的某一步 / 日誌中的某一筆）
const hhmmss = (ts) => new Date(ts).toLocaleTimeString('zh-TW', { hour12: false });
function renderRes() {
  if (!cur()) return;
  const top = cur().res, sr = $('#sr'), tabs = $('#restabs'), body = $('#resbody');
  const lv = S.logView && RLOG.find((x) => x.id === S.logView);
  if (S.logView && !lv) S.logView = null;
  // 有「接著執行」時，可以切換看每一步的完整回應
  const steps = !lv && top && !top.loading ? [{ label: '本請求', res: top }, ...(top.chain || []).filter((c) => c.res).map((c) => ({ label: '→ ' + c.name, res: c.res }))] : [];
  if (!(S.resStep < steps.length)) S.resStep = 0;
  const r = lv ? lv.res : steps.length > 1 ? steps[S.resStep].res : top;
  shownRes = r;
  const pre = (lv ? `<div class="steps"><span class="hint">📜 日誌：<b>${esc(lv.name || String(lv.url).replace(/^https?:\/\/[^/]+/, ''))}</b> · ${hhmmss(lv.at)}</span><button id="logback">✕ 回到這個分頁的回應</button></div>` : '')
    + (steps.length > 1 ? `<div class="steps">${steps.map((st, i) => `<button class="step ${i === S.resStep ? 'on' : ''}" data-step="${i}">${esc(st.label)} <b class="${st.res.error || st.res.status >= 400 ? 'bad' : 'ok'}">${st.res.error ? '✕' : st.res.status}</b></button>`).join('')}</div>` : '');
  if (!r) { sr.innerHTML = pre + '<span class="hint">按「送出」查看回應</span>'; tabs.hidden = true; body.innerHTML = ''; return; }
  if (r.loading) { sr.innerHTML = pre + '<span class="hint">⏳ 請求中…</span>'; tabs.hidden = true; body.innerHTML = ''; return; }
  if (r.error) { sr.innerHTML = pre + `<span class="pill se">失敗</span><span class="hint">${r.timeMs ?? 0} ms</span>${r.req ? '<span style="flex:1"></span><button id="copyres" data-what="req">複製請求 curl</button>' : ''}`; tabs.hidden = true; body.innerHTML = `<pre style="color:var(--bad)">${esc(r.error)}</pre>` + (r.req ? `<div class="vsec">實際送出的請求</div>${renderReqView(r.req)}` : ''); return; }
  const cls = 's' + String(r.status)[0];
  sr.innerHTML = pre + `<span class="pill ${cls}">${r.status} ${esc(r.statusText)}</span><span>${r.timeMs} ms</span><span>${fmtSize(r.size)}</span>${badges(r)}` +
    `<span style="flex:1"></span>${lastToken ? `<button id="savetok" title="${esc(lastToken[0])}">token → 存成環境變數</button>` : ''}<button id="copyres" data-what="${S.resTab === 'req' ? 'req' : 'res'}">${S.resTab === 'req' ? '複製請求 curl' : '複製回應'}</button>`;
  tabs.hidden = false;
  tabs.innerHTML = [['req', '⬆ 請求'], ['body', '回應 Body'], ['headers', `回應 Headers (${r.headers.length})`], ['cookies', `Cookies (${r.cookies.length})`]].map(([k, n]) => `<button data-t="${k}" class="${S.resTab === k ? 'on' : ''}">${n}</button>`).join('') +
    (S.resTab === 'body' && r.isText ? `<span style="flex:1"></span><label class="hint" style="padding:6px"><input type="checkbox" id="pretty" ${S.pretty ? 'checked' : ''} style="width:auto"> 格式化</label>` : '');
  if (S.resTab === 'req') body.innerHTML = renderReqView(r.req);
  else if (S.resTab === 'headers') body.innerHTML = `<table>${r.headers.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
  else if (S.resTab === 'cookies') body.innerHTML = r.cookies.length ? `<table>${r.cookies.map((c) => `<tr><td>Set-Cookie</td><td>${esc(c)}</td></tr>`).join('')}</table>` : '<span class="hint">沒有 Set-Cookie</span>';
  else if (!r.isText) body.innerHTML = /^image\//.test(r.contentType) ? `<img style="max-width:100%" src="data:${esc(r.contentType)};base64,${r.body}">` : `<span class="hint">二進位內容（${esc(r.contentType)}，${fmtSize(r.size)}）</span>`;
  else if (!r.body) body.innerHTML = '<span class="hint">（空回應）</span>';
  else { let txt = r.body, html = null; if (S.pretty && /json/i.test(r.contentType)) { try { txt = JSON.stringify(JSON.parse(r.body), null, 2); html = hlJson(txt); } catch {} } body.innerHTML = `<pre>${html ?? esc(txt)}</pre>`; }
}
$('#sr').onclick = (e) => {
  if (!cur()) return;
  const st = e.target.closest('[data-step]'); if (st) { S.resStep = +st.dataset.step; return renderRes(); }
  if (e.target.id === 'logback') { S.logView = null; renderRes(); return renderSide(); }
  const r = shownRes || cur().res; if (!r) return;
  if (e.target.id === 'copyres') { const txt = e.target.dataset.what === 'req' && r.req ? reqToCurl(r.req) : (r.body || ''); navigator.clipboard.writeText(txt).then(() => (e.target.textContent = '已複製 ✓')); }
  if (e.target.id === 'savetok') { const [k, v] = lastToken; setVar('token', v, '回應中的 ' + k, cur()); persist(); renderEnv(); e.target.textContent = `已存為 {{token}} ✓`; }
};
$('#restabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { S.resTab = b.dataset.t; renderRes(); } };
$('#restabs').onchange = (e) => { if (e.target.id === 'pretty') { S.pretty = e.target.checked; renderRes(); } };
$('#resbody').onchange = (e) => { if (e.target.id === 'showsec') { S.showSec = e.target.checked; renderRes(); } };

